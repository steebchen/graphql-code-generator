import { Types, PluginFunction } from '@graphql-codegen/plugin-helpers';
import { visit, GraphQLSchema, concatAST, Kind, FragmentDefinitionNode, OperationDefinitionNode } from 'graphql';
import { RawClientSideBasePluginConfig, LoadedFragment } from '@graphql-codegen/visitor-plugin-common';
import { GoDocumentsVisitor } from './visitor';

export interface GoDocumentsRawPluginConfig extends RawClientSideBasePluginConfig {}

export const plugin: PluginFunction<GoDocumentsRawPluginConfig> = (schema: GraphQLSchema, documents: Types.DocumentFile[], config) => {
  const allAst = concatAST(
    documents.reduce((prev, v) => {
      return [...prev, v.content];
    }, [])
  );
  const operations = allAst.definitions.filter(d => d.kind === Kind.OPERATION_DEFINITION) as OperationDefinitionNode[];
  const allFragments: LoadedFragment[] = [
    ...(allAst.definitions.filter(d => d.kind === Kind.FRAGMENT_DEFINITION) as FragmentDefinitionNode[]).map(fragmentDef => ({
      node: fragmentDef,
      name: fragmentDef.name.value,
      onType: fragmentDef.typeCondition.name.value,
      isExternal: false,
    })),
    ...(config.externalFragments || []),
  ];

  const visitor = new GoDocumentsVisitor(allFragments, operations, config) as any;
  const visitorResult = visit(allAst, { leave: visitor });

  return {
    content: [visitor.fragments, ...visitorResult.definitions.filter(t => typeof t === 'string')].join('\n'),
  };
};
