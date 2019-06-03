import { toPascalCase } from '@graphql-codegen/plugin-helpers';
import { ConvertNameFn, indent, InterfaceOrVariable, OperationVariablesToObject, ScalarsMap } from '@graphql-codegen/visitor-plugin-common';
import { getBaseTypeNode } from '@graphql-codegen/visitor-plugin-common';
import { Kind, TypeNode } from 'graphql';

export class GoOperationVariablesToObject extends OperationVariablesToObject {
  constructor(_scalars: ScalarsMap, _convertName: ConvertNameFn, private _avoidOptionals: boolean, _namespacedImportName: string | null = null) {
    super(_scalars, _convertName, _namespacedImportName);
  }

  public wrapAstTypeWithModifiers(baseType: string, typeNode: TypeNode): string {
    if (typeNode.kind === Kind.NON_NULL_TYPE) {
      return this.wrapAstTypeWithModifiers(baseType, typeNode.type);
    } else if (typeNode.kind === Kind.LIST_TYPE) {
      const innerType = this.wrapAstTypeWithModifiers(baseType, typeNode.type);

      return `[]${innerType}`;
    } else {
      return baseType;
    }
  }

  transform(variablesNode): string {
    if (!variablesNode || variablesNode.length === 0) {
      return null;
    }

    return variablesNode.map(variable => indent(this.transformVariable(variable))).join('\n');
  }

  protected getScalar(name: string): string {
    if (this._scalars[name]) {
      return this._scalars[name];
    }

    return name;
  }

  protected transformVariable<TDefinitionType extends InterfaceOrVariable>(variable: TDefinitionType): string {
    let typeValue = null;
    const prefix = this._namespacedImportName ? `${this._namespacedImportName}.` : '';

    if (typeof variable.type === 'string') {
      typeValue = variable.type;
    } else {
      const baseType = getBaseTypeNode(variable.type);
      const typeName = baseType.name.value;
      typeValue = this._scalars[typeName]
        ? this.getScalar(typeName)
        : `${prefix}${this._convertName(baseType, {
            useTypesPrefix: true,
          })}`;
    }

    const fieldName = this.getName(variable);
    const fieldType = this.wrapAstTypeWithModifiers(typeValue, variable.type);

    const hasDefaultValue = variable.defaultValue != null && typeof variable.defaultValue !== 'undefined';
    const isNonNullType = variable.type.kind === Kind.NON_NULL_TYPE;

    const formattedFieldString = this.formatFieldString(fieldName, isNonNullType, hasDefaultValue);
    const formattedTypeString = this.formatTypeString(fieldType, isNonNullType, hasDefaultValue);

    return `${toPascalCase(formattedFieldString)} ${formattedTypeString}`;
  }
}
