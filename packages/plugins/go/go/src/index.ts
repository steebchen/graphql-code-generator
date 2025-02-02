import { PluginFunction, Types } from '@graphql-codegen/plugin-helpers';
import { RawConfig } from '@graphql-codegen/visitor-plugin-common';
import { GraphQLSchema, parse, printSchema, visit } from 'graphql';
import { dirname, normalize } from 'path';
import { GoVisitor } from './visitor';

export * from './visitor';
export * from './scalars';
export * from './go-declaration-block';
export * from './go-variables-to-object';

export interface GoPluginConfig extends RawConfig {
  /**
   * @name package
   * @type string
   * @description Customize the Go package name. The default package name will be generated according to the output file path.
   *
   * @example
   * ```yml
   * generates:
   *   graphql/gql_gen.go:
   *     plugins:
   *       - go
   *     config:
   *       package: graphql
   * ```
   */
  package?: string;

  /**
   * @name imports
   * @type string[]
   * @description Add Go imports.
   *
   * @example
   * ```yml
   * generates:
   *   graphql/gql_gen.go:
   *     plugins:
   *       - go
   *     config:
   *       imports:
   *         - "time"
   *         - "github.com/custom/package/path"
   * ```
   */
  imports?: string[];

  /**
   * @name scalars
   * @type object
   * @description Configure custom scalar mapping.
   *
   * @example
   * ```yml
   * generates:
   *   graphql/gql_gen.go:
   *     plugins:
   *       - go
   *     config:
   *       scalars:
   *         time: Time
   * ```
   */
  scalars?: { [key: string]: string };
}

export const plugin: PluginFunction<GoPluginConfig> = (schema: GraphQLSchema, documents: Types.DocumentFile[], config: GoPluginConfig, { outputFile }) => {
  const relevantPath = dirname(normalize(outputFile));
  const visitor = new GoVisitor(schema, relevantPath, config);
  const printedSchema = printSchema(schema);
  const astNode = parse(printedSchema);
  const visitorResult = visit(astNode, { leave: visitor });
  const pkg = visitor.packageDefinition;
  const imports = visitor.importDefinition;

  return {
    content: [pkg, imports, ...visitorResult.definitions].join('\n'),
  };
};
