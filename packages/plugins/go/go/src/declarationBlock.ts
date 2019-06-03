import { DeclarationBlockConfig, transformComment } from '@graphql-codegen/visitor-plugin-common';
import { NameNode, StringValueNode } from 'graphql';

export class DeclarationBlock {
  _name = null;
  _kind = null;
  _methodName = null;
  _content = null;
  _block = null;
  _nameGenerics = null;
  _comment = null;
  _ignoreBlockWrapper = false;
  _implements = null;

  constructor(private _config: DeclarationBlockConfig) {
    this._config = {
      blockWrapper: '',
      blockTransformer: block => block,
      enumNameValueSeparator: ':',
      ...this._config,
    };
  }

  asKind(kind: 'struct' | 'enum'): DeclarationBlock {
    this._kind = kind;

    return this;
  }

  withComment(comment: string | StringValueNode | null): DeclarationBlock {
    if (comment) {
      this._comment = transformComment(comment, 0);
    }

    return this;
  }

  withMethodCall(methodName: string, ignoreBlockWrapper = false): DeclarationBlock {
    this._methodName = methodName;
    this._ignoreBlockWrapper = ignoreBlockWrapper;

    return this;
  }

  withBlock(block: string): DeclarationBlock {
    this._block = block;

    return this;
  }

  withContent(content: string): DeclarationBlock {
    this._content = content;

    return this;
  }

  withName(name: string | NameNode): DeclarationBlock {
    this._name = name;

    return this;
  }

  implements(interfaces: string[]): DeclarationBlock {
    this._implements = interfaces;

    return this;
  }

  public get string(): string {
    let result = '';

    result += `type ${this._name} ${this._kind} `;

    if (this._block) {
      if (this._content) {
        result += this._content;
      }

      const blockWrapper = this._ignoreBlockWrapper ? '' : this._config.blockWrapper;
      const before = '{' + blockWrapper;
      const after = blockWrapper + '}';
      const block = [before, this._block, after].filter(val => !!val).join('\n');

      if (this._methodName) {
        result += `${this._methodName}(${this._config.blockTransformer!(block)})`;
      } else {
        result += this._config.blockTransformer!(block);
      }
    } else if (this._content) {
      result += this._content;
    } else if (this._kind) {
      result += '{}';
    }

    if (this._implements) {
      result +=
        '\n' +
        this._implements
          .map(i => {
            return `func (*${this._name}) Is${i}() {}`;
          })
          .join('\n');
    }

    return (this._comment ? this._comment : '') + result + '\n';
  }
}
