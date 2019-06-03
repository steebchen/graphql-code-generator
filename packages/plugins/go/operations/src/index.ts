import { PluginFunction, Types } from '@graphql-codegen/plugin-helpers';
import { visit, concatAST, GraphQLSchema, Kind, FragmentDefinitionNode } from 'graphql';
import { GoDocumentsVisitor } from './visitor';
import { RawDocumentsConfig, LoadedFragment } from '@graphql-codegen/visitor-plugin-common';

export * from './go-operation-variables-to-object';
export * from './go-selection-set-to-object';

export interface GoDocumentsPluginConfig extends RawDocumentsConfig {}

export const plugin: PluginFunction<GoDocumentsPluginConfig> = (schema: GraphQLSchema, documents: Types.DocumentFile[], config: GoDocumentsPluginConfig) => {
  const allAst = concatAST(
    documents.reduce((prev, v) => {
      return [...prev, v.content];
    }, [])
  );

  const allFragments: LoadedFragment[] = [
    ...(allAst.definitions.filter(d => d.kind === Kind.FRAGMENT_DEFINITION) as FragmentDefinitionNode[]).map(fragmentDef => ({ node: fragmentDef, name: fragmentDef.name.value, onType: fragmentDef.typeCondition.name.value, isExternal: false })),
    ...(config.externalFragments || []),
  ];

  const visitorResult = visit(allAst, {
    leave: new GoDocumentsVisitor(schema, config, allFragments),
  });

  return '\n// go-operations\n' + visitorResult.definitions.join('\n');
};
