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
import { DeclarationBlock, GoPluginConfig } from './index';

export interface GoPluginParsedConfig extends ParsedTypesConfig {
  package: string;
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
        ...(additionalConfig || {}),
      } as TParsedConfig,
      SCALARS_MAP
    );

    autoBind(this);
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
      const comment = scalarType && scalarType.astNode && scalarType.description ? transformComment(scalarType.description, 1) : '';

      return `${comment}\ntype ${scalarName} ${scalarValue}`;
    });

    return allScalars.join('\n') + '\n\n';
  }

  NonNullType(node: NonNullTypeNode): string {
    const asString = (node.type as any) as string;

    return asString;
  }

  InputObjectTypeDefinition(node: InputObjectTypeDefinitionNode): string {
    return new DeclarationBlock(this._declarationBlockConfig)
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

    return new DeclarationBlock(this._declarationBlockConfig)
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

    let declarationBlock = new DeclarationBlock(this._declarationBlockConfig)
      .asKind('struct')
      .withName(this.convertName(node))
      // .withContent(interfaces)
      .implements(interfaces)
      .withComment((node.description as any) as string);

    const typeDefinition = declarationBlock.withBlock(allFields.join('\n')).string;

    const argumentsBlock = this.buildArgumentsBlock(originalNode);

    return [typeDefinition, argumentsBlock].filter(f => f).join('\n\n');
  }

  InterfaceTypeDefinition(node: InterfaceTypeDefinitionNode, key: number | string, parent: any): string {
    const optionalTypename = this.config.nonOptionalTypename ? '' : '*';
    // const allFields = [...(this.config.addTypename ? [indent(`__typename "${optionalTypename}${node.name}",`)] : []), ...node.fields];
    const allFields = node.fields;
    const argumentsBlock = this.buildArgumentsBlock(parent[key] as InterfaceTypeDefinitionNode);

    let declarationBlock = new DeclarationBlock(this._declarationBlockConfig)
      .asKind('struct')
      .withName(this.convertName(node))
      .withComment((node.description as any) as string);

    const interfaceDefinition = declarationBlock.withBlock(allFields.join('\n')).string;

    return [interfaceDefinition, argumentsBlock].filter(f => f).join('\n\n');
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
    // const enumName = (node.name as any) as string;
    //
    // // In case of mapped external enum string
    // if (this.config.enumValues[enumName] && typeof this.config.enumValues[enumName] === 'string') {
    //   return null;
    // }

    // return new DeclarationBlock(this._declarationBlockConfig)
    //   .asKind('enum')
    //   .withName(this.convertName(node))
    //   .withComment((node.description as any) as string)
    //   .withBlock(this.buildEnumValuesBlock('enumName', node.values)).string;
    const name = this.convertName(node);

    const values = node.values.map(i => indent(`${name}${toPascalCase(i.name.toString())} ${name} = "${i.name}"\n`)).join('');

    return `type ${name} string
const (
${values}
)
`;
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

  protected buildArgumentsBlock(node: InterfaceTypeDefinitionNode | ObjectTypeDefinitionNode) {
    // const fieldsWithArguments = node.fields.filter(field => field.arguments && field.arguments.length > 0) || [];
    // return fieldsWithArguments
    //   .map(field => {
    //     const name =
    //       node.name.value +
    //       this.convertName(field, {
    //         useTypesPrefix: false,
    //       }) +
    //       'Args';
    //
    //     return new DeclarationBlock(this._declarationBlockConfig)
    //       .asKind('struct')
    //       .withName(this.convertName(name))
    //       .withComment(node.description)
    //       .withBlock(field.arguments.map(i => `${i.name.value} ${getBaseTypeNode(i)}`).join('\n')).string;
    //   })
    //   .join('\n\n');
    return `// argument block ${node.name.value}\n\n`;
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
