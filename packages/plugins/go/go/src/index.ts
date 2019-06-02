import { Types, PluginFunction } from '@graphql-codegen/plugin-helpers';
import { parse, printSchema, visit, GraphQLSchema, TypeInfo, GraphQLNamedType, visitWithTypeInfo, getNamedType, isIntrospectionType, DocumentNode, printIntrospectionSchema, isObjectType } from 'graphql';
import { RawTypesConfig } from '@graphql-codegen/visitor-plugin-common';
import { GoVisitor } from './visitor';
import { GoIntrospectionVisitor } from './introspection-visitor';
export * from './go-variables-to-object';
export * from './visitor';

export interface GoPluginConfig extends RawTypesConfig {
  /**
   * @name avoidOptionals
   * @type boolean
   * @description This will cause the generator to avoid using Go optionals (`?`),
   * so the following definition: `type A { myField: String }` will output `myField: Maybe<string>`
   * instead of `myField?: Maybe<string>`.
   * @default false
   *
   * @example
   * ```yml
   * generates:
   * path/to/file.ts:
   *  plugins:
   *    - go
   *  config:
   *    avoidOptionals: true
   * ```
   */
  avoidOptionals?: boolean;
  /**
   * @name constEnums
   * @type boolean
   * @description Will prefix every generated `enum` with `const`, you can read more
   * about const enums {@link https://www.golang.org/docs/handbook/enums.html|here}.
   * @default false
   *
   * @example
   * ```yml
   * generates:
   * path/to/file.ts:
   *  plugins:
   *    - go
   *  config:
   *    constEnums: true
   * ```
   */
  constEnums?: boolean;
  /**
   * @name enumsAsTypes
   * @type boolean
   * @description Generates enum as Go `type` instead of `enum`. Useful it you wish to genereate `.d.ts` declartion file instead of `.ts`
   * @default false
   *
   * @example
   * ```yml
   * generates:
   * path/to/file.ts:
   *  plugins:
   *    - go
   *  config:
   *    enumsAsTypes: true
   * ```
   */
  enumsAsTypes?: boolean;
}

export const plugin: PluginFunction<GoPluginConfig> = (schema: GraphQLSchema, documents: Types.DocumentFile[], config: GoPluginConfig) => {
  const visitor = new GoVisitor(schema, config);
  const printedSchema = printSchema(schema);
  const astNode = parse(printedSchema);
  const visitorResult = visit(astNode, { leave: visitor });
  const introspectionDefinitions = includeIntrospectionDefinitions(schema, documents, config);
  const scalars = visitor.scalarsDefinition;

  return {
    prepend: [...visitor.getEnumsImports()],
    content: [scalars, ...visitorResult.definitions, ...introspectionDefinitions].join('\n'),
  };
};

function includeIntrospectionDefinitions(schema: GraphQLSchema, documents: Types.DocumentFile[], config: GoPluginConfig): string[] {
  const typeInfo = new TypeInfo(schema);
  const usedTypes: GraphQLNamedType[] = [];
  const documentsVisitor = visitWithTypeInfo(typeInfo, {
    Field() {
      const type = getNamedType(typeInfo.getType());

      if (isIntrospectionType(type) && !usedTypes.includes(type)) {
        usedTypes.push(type);
      }
    },
  });

  documents.forEach(doc => visit(doc.content, documentsVisitor));

  const typesToInclude: GraphQLNamedType[] = [];

  usedTypes.forEach(type => {
    collectTypes(type);
  });

  const visitor = new GoIntrospectionVisitor(schema, config, typesToInclude);
  const result: DocumentNode = visit(parse(printIntrospectionSchema(schema)), { leave: visitor });

  // recursively go through each `usedTypes` and their children and collect all used types
  // we don't care about Interfaces, Unions and others, but Objects and Enums
  function collectTypes(type: GraphQLNamedType): void {
    if (typesToInclude.includes(type)) {
      return;
    }

    typesToInclude.push(type);

    if (isObjectType(type)) {
      const fields = type.getFields();

      Object.keys(fields).forEach(key => {
        const field = fields[key];
        const type = getNamedType(field.type);
        collectTypes(type);
      });
    }
  }

  return result.definitions as any[];
}
