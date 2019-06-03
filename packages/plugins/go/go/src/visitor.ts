import { BaseVisitor, indent, ParsedTypesConfig, parseMapper, toPascalCase, transformComment, wrapWithSingleQuotes } from '@graphql-codegen/visitor-plugin-common';
import * as autoBind from 'auto-bind';
import {
  DirectiveDefinitionNode,
  EnumTypeDefinitionNode,
  EnumValueDefinitionNode,
  FieldDefinitionNode,
  GraphQLSchema,
  InputObjectTypeDefinitionNode,
  InputValueDefinitionNode,
  InterfaceTypeDefinitionNode,
  ListTypeNode,
  NamedTypeNode,
  NameNode,
  NonNullTypeNode,
  ObjectTypeDefinitionNode,
  ScalarTypeDefinitionNode,
  StringValueNode,
  UnionTypeDefinitionNode,
} from 'graphql';
import { GoDeclarationBlock, GoPluginConfig } from './index';

export interface GoPluginParsedConfig extends ParsedTypesConfig {
  package: string;
  imports: string[];
  scalars: { [key: string]: string };
}

const SCALARS_MAP = {
  ID: 'string',
  String: 'string',
  Boolean: 'bool',
  Int: 'int',
  Float: 'float64',
};

export class GoVisitor<TRawConfig extends GoPluginConfig = GoPluginConfig, TParsedConfig extends GoPluginParsedConfig = GoPluginParsedConfig> extends BaseVisitor<TRawConfig, TParsedConfig> {
  constructor(protected _schema: GraphQLSchema, defaultPackageName: string, pluginConfig: TRawConfig, additionalConfig: Partial<TParsedConfig> = {}) {
    super(
      pluginConfig,
      {
        package: pluginConfig.package || defaultPackageName,
        imports: pluginConfig.imports || [],
        // scalars are not added here because it is handled by pluginConfig / BaseVisitor
        ...(additionalConfig || {}),
      } as TParsedConfig,
      SCALARS_MAP
    );

    autoBind(this);
  }

  public get importDefinition(): string {
    if (!this.config.imports.length) {
      return '';
    }

    const imports = this.config.imports.map(i => indent(`"${i}"`)).join('\n');
    return `import (
${imports}
)\n`;
  }

  public get packageDefinition(): string {
    let pkg = 'main';

    if (this.config.package) {
      pkg = this.config.package;
    }

    return `package ${pkg}\n\n`;
  }

  public get scalarsDefinition(): string {
    const allScalars = Object.keys(this.config.scalars).map(scalarName => {
      const scalarValue = this.config.scalars[scalarName];
      const scalarType = this._schema.getType(scalarName);
      const comment = scalarType && scalarType.astNode && scalarType.description ? transformComment(scalarType.description, 1) + '\n' : '';

      return comment + `type ${scalarName} ${scalarValue}`;
    });

    return allScalars.join('\n') + '\n\n';
  }

  NonNullType(node: NonNullTypeNode): string {
    const asString = (node.type as any) as string;

    return asString;
  }

  InputObjectTypeDefinition(node: InputObjectTypeDefinitionNode): string {
    return new GoDeclarationBlock(this._declarationBlockConfig)
      .asKind('struct')
      .withName(this.convertName(node))
      .withComment((node.description as any) as string)
      .withBlock(node.fields.join('\n')).string;
  }

  InputValueDefinition(node: InputValueDefinitionNode): string {
    const comment = transformComment((node.description as any) as string, 1);

    // TODO to go case
    return comment + indent(`${toPascalCase(node.name.toString())} ${node.type} \`json:"${node.name}"\``);
  }

  Name(node: NameNode): string {
    return node.value;
  }

  FieldDefinition(node: FieldDefinitionNode): string {
    const typeString = (node.type as any) as string;
    const comment = transformComment((node.description as any) as string, 1);

    // TODO to go case
    return comment + indent(`${toPascalCase(node.name.toString())} ${typeString} \`json:"${node.name}"\``);
  }

  UnionTypeDefinition(node: UnionTypeDefinitionNode, key: string | number, parent: any): string {
    const originalNode = parent[key] as UnionTypeDefinitionNode;
    const possibleTypes = originalNode.types.map(t => (this.scalars[t.name.value] ? t.name.value : this.convertName(t))).join(' | ');

    return new GoDeclarationBlock(this._declarationBlockConfig)
      .asKind('struct')
      .withName(this.convertName(node))
      .withComment((node.description as any) as string)
      .withContent(possibleTypes).string;
  }

  ObjectTypeDefinition(node: ObjectTypeDefinitionNode, key: number | string, parent: any): string {
    const originalNode = parent[key] as ObjectTypeDefinitionNode;
    const optionalTypename = this.config.nonOptionalTypename ? '' : '*';
    // const allFields = [...(this.config.addTypename ? [indent(`__typename "${optionalTypename}${node.name}",`)] : []), ...node.fields];
    const allFields = node.fields;
    const interfaces = originalNode.interfaces.map(i => this.convertName(i));

    let declarationBlock = new GoDeclarationBlock(this._declarationBlockConfig)
      .asKind('struct')
      .withName(this.convertName(node))
      .implements(interfaces)
      .withComment((node.description as any) as string);

    return declarationBlock.withBlock(allFields.join('\n')).string;
  }

  InterfaceTypeDefinition(node: InterfaceTypeDefinitionNode, key: number | string, parent: any): string {
    const optionalTypename = this.config.nonOptionalTypename ? '' : '*';
    // const allFields = [...(this.config.addTypename ? [indent(`__typename "${optionalTypename}${node.name}",`)] : []), ...node.fields];
    const allFields = node.fields;

    let declarationBlock = new GoDeclarationBlock(this._declarationBlockConfig)
      .asKind('struct')
      .withName(this.convertName(node))
      .withComment((node.description as any) as string);

    return declarationBlock.withBlock(allFields.join('\n')).string;
  }

  ScalarTypeDefinition(node: ScalarTypeDefinitionNode): string {
    // We empty this because we handle scalars in a different way, see constructor.
    return '';
  }

  protected _buildEnumImport(identifier: string, source: string): string {
    return `import { ${identifier} } from '${source}';`;
  }

  public getEnumsImports(): string[] {
    return Object.keys(this.config.enumValues)
      .map(enumName => {
        const mappedValue = this.config.enumValues[enumName];

        if (mappedValue && typeof mappedValue === 'string') {
          const mapper = parseMapper(mappedValue);

          if (mapper.isExternal) {
            const identifier = mapper.type === enumName ? enumName : `${mapper.type} as ${enumName}`;

            return this._buildEnumImport(identifier, mapper.source);
          }
        }

        return null;
      })
      .filter(a => a);
  }

  EnumTypeDefinition(node: EnumTypeDefinitionNode): string {
    const name = this.convertName(node);

    const values = node.values.map(i => indent(`${name}${toPascalCase(i.name.toString())} ${name} = "${i.name}"`)).join('\n');

    return `type ${name} string
const (
${values}
)\n`;
  }

  // We are using it in order to transform "description" field
  StringValue(node: StringValueNode): string {
    return node.value;
  }

  protected buildEnumValuesBlock(typeName: string, values: ReadonlyArray<EnumValueDefinitionNode>): string {
    return values
      .map(enumOption => {
        const optionName = this.convertName(enumOption, { useTypesPrefix: false, transformUnderscore: true });
        const comment = transformComment((enumOption.description as any) as string, 1);
        let enumValue: string = (enumOption.name as any) as string;

        // if (this.config.enumValues[typeName] && typeof this.config.enumValues[typeName] === 'object' && this.config.enumValues[typeName][enumValue]) {
        //   enumValue = this.config.enumValues[typeName][enumValue];
        // }

        return comment + indent(`${optionName}${this._declarationBlockConfig.enumNameValueSeparator} ${wrapWithSingleQuotes(enumValue)}`);
      })
      .join(',\n');
  }

  DirectiveDefinition(node: DirectiveDefinitionNode): string {
    return '';
  }

  protected _getTypeForNode(node: NamedTypeNode): string {
    const typeAsString = (node.name as any) as string;

    if (this.scalars[typeAsString]) {
      return typeAsString;
    }

    return this.convertName(node);
  }

  NamedType(node: NamedTypeNode): string {
    return this._getTypeForNode(node);
  }

  ListType(node: ListTypeNode): string {
    const asString = (node.type as any) as string;

    return this.wrapWithListType(asString);
  }

  SchemaDefinition() {
    return null;
  }

  protected wrapWithListType(str: string): string {
    return `[]${str}`;
  }
}
