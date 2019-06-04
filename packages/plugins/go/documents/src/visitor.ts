import { toPascalCase } from '@graphql-codegen/plugin-helpers';
import { ClientSideBaseVisitor, ClientSideBasePluginConfig, LoadedFragment } from '@graphql-codegen/visitor-plugin-common';
import * as autoBind from 'auto-bind';
import { FragmentDefinitionNode, OperationDefinitionNode, print } from 'graphql';
import { GoDocumentsRawPluginConfig } from './index';

export interface GoDocumentsPluginConfig extends ClientSideBasePluginConfig {}

export class GoDocumentsVisitor extends ClientSideBaseVisitor<GoDocumentsRawPluginConfig, GoDocumentsPluginConfig> {
  constructor(fragments: LoadedFragment[], private _allOperations: OperationDefinitionNode[], rawConfig: GoDocumentsRawPluginConfig) {
    super(fragments, rawConfig, {});

    autoBind(this);
  }

  protected _includeFragments(fragments: string[]): string {
    if (fragments && fragments.length > 0) {
      return `${fragments
        .filter((name, i, all) => all.indexOf(name) === i)
        .map(name => '` + ' + name + ' + `')
        .join('\n')}`;
    }

    return '';
  }

  protected _generateFragment(fragmentDocument: FragmentDefinitionNode): string | void {
    const name = this._getFragmentName(fragmentDocument);

    return `const ${name} = ${this._gql(fragmentDocument)};`;
  }

  protected _gql(node: FragmentDefinitionNode | OperationDefinitionNode): string {
    const doc = this._prepareDocument(print(node) + this._includeFragments(this._transformFragments(node)));

    return '`' + doc + '`';
  }

  public OperationDefinition(node: OperationDefinitionNode): string {
    if (!node.name || !node.name.value) {
      return null;
    }

    this._collectedOperations.push(node);

    const documentVariableName = this.convertName(node, {
      suffix: 'Document',
      useTypesPrefix: false,
    });
    const documentString = `const ${documentVariableName} = ${this._gql(node)}`;
    const operationType: string = toPascalCase(node.operation);
    const operationResultType: string = this.convertName(node, {
      suffix: operationType,
    });
    const operationVariablesTypes: string = this.convertName(node, {
      suffix: operationType + 'Variables',
    });

    const additional = this.buildOperation(node, documentVariableName, operationType, operationResultType, operationVariablesTypes);

    return [documentString, additional].filter(a => a).join('\n');
  }
}
