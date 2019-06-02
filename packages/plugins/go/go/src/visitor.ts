import {
  transformComment,
  wrapWithSingleQuotes,
  indent,
  BaseTypesVisitor,
  ParsedTypesConfig,
  toPascalCase,
  BaseVisitor, getBaseType, getBaseTypeNode,
} from '@graphql-codegen/visitor-plugin-common';
import {
  DeclarationBlockConfig,
  OperationVariablesToObject,
  parseMapper,
} from '@graphql-codegen/visitor-plugin-common';
import { GoPluginConfig } from './index';
import * as autoBind from 'auto-bind';
import {
  FieldDefinitionNode,
  NamedTypeNode,
  ListTypeNode,
  NonNullTypeNode,
  EnumTypeDefinitionNode,
  Kind,
  InputValueDefinitionNode,
  GraphQLSchema,
  InputObjectTypeDefinitionNode,
  NameNode,
  UnionTypeDefinitionNode,
  ObjectTypeDefinitionNode,
  InterfaceTypeDefinitionNode,
  ScalarTypeDefinitionNode,
  StringValueNode,
  EnumValueDefinitionNode,
  DirectiveDefinitionNode,
} from 'graphql';

export interface GoPluginParsedConfig extends ParsedTypesConfig {
  avoidOptionals: boolean;
  constEnums: boolean;
  enumsAsTypes: boolean;
}
export class DeclarationBlock {
  _name = null;
  _kind = null;
  _methodName = null;
  _content = null;
  _block = null;
  _nameGenerics = null;
  _comment = null;
  _ignoreBlockWrapper = false;
  _implements = null;

  constructor(private _config: DeclarationBlockConfig) {
    this._config = {
      blockWrapper: '',
      blockTransformer: block => block,
      enumNameValueSeparator: ':',
      ...this._config,
    };
  }

  asKind(kind: 'struct' | 'enum'): DeclarationBlock {
    this._kind = kind;

    return this;
  }

  withComment(comment: string | StringValueNode | null): DeclarationBlock {
    if (comment) {
      this._comment = transformComment(comment, 0);
    }

    return this;
  }

  withMethodCall(methodName: string, ignoreBlockWrapper = false): DeclarationBlock {
    this._methodName = methodName;
    this._ignoreBlockWrapper = ignoreBlockWrapper;

    return this;
  }

  withBlock(block: string): DeclarationBlock {
    this._block = block;

    return this;
  }

  withContent(content: string): DeclarationBlock {
    this._content = content;

    return this;
  }

  withName(name: string | NameNode): DeclarationBlock {
    this._name = name;

    return this;
  }

  implements(interfaces: string[]): DeclarationBlock {
    this._implements = interfaces;

    return this;
  }

  public get string(): string {
    let result = '';

    result += `type ${this._name} ${this._kind} `;

    if (this._block) {
      if (this._content) {
        result += this._content;
      }

      const blockWrapper = this._ignoreBlockWrapper ? '' : this._config.blockWrapper;
      const before = '{' + blockWrapper;
      const after = blockWrapper + '}';
      const block = [before, this._block, after].filter(val => !!val).join('\n');

      if (this._methodName) {
        result += `${this._methodName}(${this._config.blockTransformer!(block)})`;
      } else {
        result += this._config.blockTransformer!(block);
      }
    } else if (this._content) {
      result += this._content;
    } else if (this._kind) {
      result += '{}';
    }

    if (this._implements) {
      result += '\n' + this._implements.map(i => {
        return `func (*${this._name}) Is${i}() {}`;
      }).join('\n');
    }

    return (this._comment ? this._comment : '') + result + '\n';
  }
}

export class GoVisitor<TRawConfig extends GoPluginConfig = GoPluginConfig, TParsedConfig extends GoPluginParsedConfig = GoPluginParsedConfig> extends BaseVisitor<TRawConfig, TParsedConfig> {
  constructor(protected _schema: GraphQLSchema, pluginConfig: TRawConfig, additionalConfig: Partial<TParsedConfig> = {}) {
    super(pluginConfig, {
      avoidOptionals: pluginConfig.avoidOptionals || false,
      constEnums: pluginConfig.constEnums || false,
      enumsAsTypes: pluginConfig.enumsAsTypes || false,
      ...(additionalConfig || {}),
    } as TParsedConfig);

    autoBind(this);
  }

  public get scalarsDefinition(): string {
    const allScalars = Object.keys(this.config.scalars).map(scalarName => {
      const scalarValue = this.config.scalars[scalarName];
      const scalarType = this._schema.getType(scalarName);
      const comment = scalarType && scalarType.astNode && scalarType.description ? transformComment(scalarType.description, 1) : '';

      return comment + indent(`type ${scalarName} ${scalarValue}`);
    });

    // TODO move somewhere else
    return 'package main\n\n' + allScalars.join('\n');
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
