import { transformComment, wrapWithSingleQuotes, DeclarationBlock, indent, BaseTypesVisitor, ParsedTypesConfig, toPascalCase } from '@graphql-codegen/visitor-plugin-common';
import { GoPluginConfig } from './index';
import * as autoBind from 'auto-bind';
import { FieldDefinitionNode, NamedTypeNode, ListTypeNode, NonNullTypeNode, EnumTypeDefinitionNode, Kind, InputValueDefinitionNode, GraphQLSchema } from 'graphql';
import { GoOperationVariablesToObject } from './go-variables-to-object';

export interface GoPluginParsedConfig extends ParsedTypesConfig {
  avoidOptionals: boolean;
  constEnums: boolean;
  enumsAsTypes: boolean;
}

export class GoVisitor<TRawConfig extends GoPluginConfig = GoPluginConfig, TParsedConfig extends GoPluginParsedConfig = GoPluginParsedConfig> extends BaseTypesVisitor<TRawConfig, TParsedConfig> {
  constructor(schema: GraphQLSchema, pluginConfig: TRawConfig, additionalConfig: Partial<TParsedConfig> = {}) {
    super(schema, pluginConfig, {
      avoidOptionals: pluginConfig.avoidOptionals || false,
      constEnums: pluginConfig.constEnums || false,
      enumsAsTypes: pluginConfig.enumsAsTypes || false,
      ...(additionalConfig || {}),
    } as TParsedConfig);

    autoBind(this);
    this.setArgumentsTransformer(new GoOperationVariablesToObject(this.scalars, this.convertName, this.config.avoidOptionals));
    this.setDeclarationBlockConfig({
      enumNameValueSeparator: ' =',
    });
  }

  private clearOptional(str: string): string {
    if (str.startsWith('Maybe')) {
      return str.replace(/Maybe<(.*?)>$/, '$1');
    }

    return str;
  }

  NamedType(node: NamedTypeNode): string {
    return `${super.NamedType(node)}`;
  }

  ListType(node: ListTypeNode): string {
    return `*${super.ListType(node)}`;
  }

  protected wrapWithListType(str: string): string {
    return `[]${str}`;
  }

  NonNullType(node: NonNullTypeNode): string {
    const baseValue = super.NonNullType(node);

    return this.clearOptional(baseValue);
  }

  FieldDefinition(node: FieldDefinitionNode, key?: number | string, parent?: any): string {
    const typeString = (node.type as any) as string;
    const originalFieldNode = parent[key] as FieldDefinitionNode;
    const addOptionalSign = !this.config.avoidOptionals && originalFieldNode.type.kind !== Kind.NON_NULL_TYPE;
    const comment = transformComment((node.description as any) as string, 1);

    return comment + indent(`${toPascalCase(node.name.toString())} ${addOptionalSign ? '*' : ''}${typeString}`);
  }

  InputValueDefinition(node: InputValueDefinitionNode, key?: number | string, parent?: any): string {
    const originalFieldNode = parent[key] as FieldDefinitionNode;
    const addOptionalSign = !this.config.avoidOptionals && originalFieldNode.type.kind !== Kind.NON_NULL_TYPE;
    const comment = transformComment((node.description as any) as string, 1);

    return comment + indent(`${toPascalCase(node.name.toString())} ${addOptionalSign ? '*' : ''}${node.type}`);
  }

  EnumTypeDefinition(node: EnumTypeDefinitionNode): string {
    const enumName = (node.name as any) as string;

    // In case of mapped external enum string
    if (this.config.enumValues[enumName] && typeof this.config.enumValues[enumName] === 'string') {
      return null;
    }

    if (this.config.enumsAsTypes) {
      return new DeclarationBlock(this._declarationBlockConfig)
        .export()
        .asKind('type')
        .withComment((node.description as any) as string)
        .withName(this.convertName(node))
        .withContent(
          '\n' +
            node.values
              .map(enumOption => {
                let enumValue: string = (enumOption.name as any) as string;
                const comment = transformComment((enumOption.description as any) as string, 1);

                if (this.config.enumValues[enumName] && typeof this.config.enumValues[enumName] === 'object' && this.config.enumValues[enumName][enumValue]) {
                  enumValue = this.config.enumValues[enumName][enumValue];
                }

                return comment + indent(wrapWithSingleQuotes(enumValue));
              })
              .join(' |\n')
        ).string;
    } else {
      return new DeclarationBlock(this._declarationBlockConfig)
        .export()
        .asKind(this.config.constEnums ? 'const enum' : 'enum')
        .withName(this.convertName(node))
        .withComment((node.description as any) as string)
        .withBlock(this.buildEnumValuesBlock(enumName, node.values)).string;
    }
  }
}
