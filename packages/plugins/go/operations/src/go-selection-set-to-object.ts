import { toPascalCase } from '@graphql-codegen/plugin-helpers';
import { SelectionSetToObject, ConvertNameFn, ScalarsMap, LoadedFragment } from '@graphql-codegen/visitor-plugin-common';
import { indent, FragmentsMap, LinkField, PrimitiveAliasedFields, PrimitiveField } from '@graphql-codegen/visitor-plugin-common';
import {
  GraphQLSchema,
  GraphQLNamedType,
  SelectionSetNode,
  GraphQLObjectType,
  GraphQLNonNull,
  GraphQLList,
  isNonNullType,
  isListType,
  Kind,
  FieldNode,
  FragmentSpreadNode,
  InlineFragmentNode,
  isUnionType,
  isInterfaceType,
  isObjectType,
} from 'graphql';
import { GoDocumentsParsedConfig } from './visitor';

export class GoSelectionSetToObject extends SelectionSetToObject {
  protected _primitiveFields: PrimitiveField[] = [];
  protected _primitiveAliasedFields: PrimitiveAliasedFields[] = [];
  protected _linksFields: LinkField[] = [];
  protected _fragments: FragmentsMap = {};
  protected _queriedForTypename = false;

  constructor(
    _scalars: ScalarsMap,
    _schema: GraphQLSchema,
    _convertName: ConvertNameFn,
    _addTypename: boolean,
    _nonOptionalTypename: boolean,
    _loadedFragments: LoadedFragment[],
    private _config: GoDocumentsParsedConfig,
    _parentSchemaType?: GraphQLNamedType,
    _selectionSet?: SelectionSetNode
  ) {
    super(_scalars, _schema, _convertName, _addTypename, _nonOptionalTypename, _loadedFragments, _config.namespacedImportName, _parentSchemaType, _selectionSet);
  }

  public createNext(parentSchemaType: GraphQLNamedType, selectionSet: SelectionSetNode): SelectionSetToObject {
    return new GoSelectionSetToObject(this._scalars, this._schema, this._convertName, this._addTypename, this._nonOptionalTypename, this._loadedFragments, this._config, parentSchemaType, selectionSet);
  }

  protected wrapTypeWithModifiers(baseType: string, type: GraphQLObjectType | GraphQLNonNull<GraphQLObjectType> | GraphQLList<GraphQLObjectType>): string {
    const prefix = this._config.namespacedImportName ? `${this._config.namespacedImportName}.` : '';

    if (isNonNullType(type)) {
      return this.wrapTypeWithModifiers(baseType, type.ofType);
    } else if (isListType(type)) {
      const innerType = this.wrapTypeWithModifiers(baseType, type.ofType);

      return `${prefix}[]${innerType}`;
    } else {
      return `${prefix}${baseType}`;
    }
  }

  get string(): string {
    if (!this._selectionSet || !this._selectionSet.selections || this._selectionSet.selections.length === 0) {
      return '';
    }

    const { selections } = this._selectionSet;

    for (const selection of selections) {
      switch (selection.kind) {
        case Kind.FIELD:
          this._collectField(selection as FieldNode);
          break;
        case Kind.FRAGMENT_SPREAD:
          this._collectFragmentSpread(selection as FragmentSpreadNode);
          break;
        case Kind.INLINE_FRAGMENT:
          this._collectInlineFragment(selection as InlineFragmentNode);
          break;
      }
    }

    const parentName =
      (this._namespacedImportName ? `${this._namespacedImportName}.` : '') +
      this._convertName(this._parentSchemaType.name, {
        useTypesPrefix: true,
      });

    const baseFields = this.buildPrimitiveFields(parentName, this._primitiveFields);
    const aliasBaseFields = this.buildAliasedPrimitiveFields(parentName, this._primitiveAliasedFields);
    const linksFields = this.buildLinkFields(this._linksFields);
    const fragments = this.buildFragments(this._fragments);
    const typeName = this._nonOptionalTypename || this._addTypename || this._queriedForTypename ? this.buildTypeNameField() : null;

    const fields = [typeName, baseFields, aliasBaseFields, linksFields, fragments].filter(f => f && f !== '').join('\n');
    return `struct {\n${fields}\n}`;
  }

  protected getScalar(name: string): string {
    if (this._scalars[name]) {
      return this._scalars[name];
    }

    return name;
  }

  protected buildTypeNameField(): string | null {
    const possibleTypes = [];

    if (isUnionType(this._parentSchemaType)) {
      return null;
    } else if (isInterfaceType(this._parentSchemaType)) {
      possibleTypes.push(...this.getImplementingTypes(this._parentSchemaType));
    } else {
      possibleTypes.push(this._parentSchemaType.name);
    }

    if (possibleTypes.length === 0) {
      return null;
    }

    const optionalTypename = !this._queriedForTypename && !this._nonOptionalTypename;

    return indent(`${this.formatNamedField('Typename')} ${optionalTypename ? '*' : ''}string \`json:"__typename" types:"${possibleTypes.join(',')}"\``);
  }

  protected buildPrimitiveFields(parentName: string, fields: PrimitiveField[]): string | null {
    if (fields.length === 0) {
      return null;
    }

    return fields.map(field => indent(`${toPascalCase(field.name)} ${this.getScalar(field.type)} \`json:"${field.name}"\``)).join('\n');
  }

  protected buildAliasedPrimitiveFields(parentName: string, fields: PrimitiveAliasedFields[]): string | null {
    if (fields.length === 0) {
      return null;
    }

    return fields.map(aliasedField => indent(`${toPascalCase(aliasedField.alias)} ${this.getScalar(aliasedField.type)} \`json:"${aliasedField.alias}" originalField:"${aliasedField.name}"\``)).join('\n');
  }

  protected buildLinkFields(fields: LinkField[]): string | null {
    if (fields.length === 0) {
      return null;
    }

    return fields.map(field => indent(`${toPascalCase(field.alias || field.name)} ${field.selectionSet} \`json:"${field.alias || field.name}"\``)).join('\n');
  }

  protected buildFragments(fragments: FragmentsMap): string | null {
    if (isUnionType(this._parentSchemaType) || isInterfaceType(this._parentSchemaType)) {
      return indent(this._handleFragmentsForUnionAndInterface(fragments));
    } else if (isObjectType(this._parentSchemaType)) {
      return indent(this._handleFragmentsForObjectType(fragments));
    }

    return null;
  }
}
