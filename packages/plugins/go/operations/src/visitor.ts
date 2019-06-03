import { GoDeclarationBlock } from '@graphql-codegen/go';
import { GO_SCALARS } from '@graphql-codegen/go';
import { getRootType, toPascalCase } from '@graphql-codegen/visitor-plugin-common';
import { FragmentDefinitionNode, GraphQLObjectType, GraphQLSchema, OperationDefinitionNode, VariableDefinitionNode } from 'graphql';
import { ParsedDocumentsConfig, BaseDocumentsVisitor, LoadedFragment } from '@graphql-codegen/visitor-plugin-common';
import { GoDocumentsPluginConfig, GoOperationVariablesToObject, GoSelectionSetToObject } from './index';

export interface GoDocumentsParsedConfig extends ParsedDocumentsConfig {}

export class GoDocumentsVisitor extends BaseDocumentsVisitor<GoDocumentsPluginConfig, GoDocumentsParsedConfig> {
  constructor(schema: GraphQLSchema, config: GoDocumentsPluginConfig, allFragments: LoadedFragment[]) {
    super(
      config,
      {
        nonOptionalTypename: config.nonOptionalTypename || false,
      } as GoDocumentsParsedConfig,
      schema,
      GO_SCALARS
    );

    this.setSelectionSetHandler(new GoSelectionSetToObject(this.scalars, this.schema, this.convertName, this.config.addTypename, this.config.nonOptionalTypename, allFragments, this.config));
    this.setVariablesTransformer(new GoOperationVariablesToObject(this.scalars, this.convertName, false, this.config.namespacedImportName));
  }

  FragmentDefinition(node: FragmentDefinitionNode): string {
    const fragmentRootType = this._schema.getType(node.typeCondition.name.value) as GraphQLObjectType;
    const selectionSet = this._selectionSetToObject.createNext(fragmentRootType, node.selectionSet);

    return new GoDeclarationBlock(this._declarationBlockConfig)
      .withName(
        this.convertName(node, {
          useTypesPrefix: true,
          suffix: 'Fragment',
        })
      )
      .withContent(selectionSet.string).string;
  }

  OperationDefinition(node: OperationDefinitionNode): string {
    const name = this.handleAnonymousOperation(node);
    const operationRootType = getRootType(node.operation, this._schema);

    if (!operationRootType) {
      throw new Error(`Unable to find root schema type for operation type "${node.operation}"!`);
    }

    const selectionSet = this._selectionSetToObject.createNext(operationRootType, node.selectionSet);
    const visitedOperationVariables = this._variablesTransfomer.transform<VariableDefinitionNode>(node.variableDefinitions);

    const operationResult = new GoDeclarationBlock(this._declarationBlockConfig)
      .withName(
        this.convertName(name, {
          suffix: toPascalCase(node.operation),
        })
      )
      .withContent(selectionSet.string).string;

    const operationVariables = new GoDeclarationBlock(this._declarationBlockConfig)
      .asKind('struct')
      .withName(
        this.convertName(name, {
          suffix: toPascalCase(node.operation) + 'Variables',
        })
      )
      .withBlock(visitedOperationVariables).string;

    return [operationVariables, operationResult].filter(r => r).join('\n\n');
  }
}
