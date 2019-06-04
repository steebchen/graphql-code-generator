import { GoOperationVariablesToObject as OperationVariablesToObject } from '@graphql-codegen/go';

export class GoOperationVariablesToObject extends OperationVariablesToObject {
  protected formatTypeString(fieldType: string, isNonNullType: boolean, hasDefaultValue: boolean): string {
    return fieldType;
  }
}
