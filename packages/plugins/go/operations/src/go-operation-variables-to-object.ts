import { GoOperationVariablesToObject as TSOperationVariablesToObject } from '@graphql-codegen/go';

export class GoOperationVariablesToObject extends TSOperationVariablesToObject {
  protected formatTypeString(fieldType: string, isNonNullType: boolean, hasDefaultValue: boolean): string {
    return fieldType;
  }
}
