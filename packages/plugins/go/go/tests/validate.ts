import { Types } from '@graphql-codegen/plugin-helpers';
import * as ts from 'go';
import * as path from 'path';

export function validateGo(
  pluginOutput: Types.PluginOutput,
  options: ts.CompilerOptions = {
    noEmitOnError: true,
    noImplicitAny: true,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    experimentalDecorators: true,
    emitDecoratorMetadata: true,
    target: ts.ScriptTarget.ES5,
    typeRoots: [path.resolve(require.resolve('go'), '../../../@types/')],
    jsx: ts.JsxEmit.Preserve,
    allowJs: true,
    lib: [
      path.join(path.dirname(require.resolve('go')), 'lib.es5.d.ts'),
      path.join(path.dirname(require.resolve('go')), 'lib.es6.d.ts'),
      path.join(path.dirname(require.resolve('go')), 'lib.dom.d.ts'),
      path.join(path.dirname(require.resolve('go')), 'lib.scripthost.d.ts'),
      path.join(path.dirname(require.resolve('go')), 'lib.es2015.d.ts'),
      path.join(path.dirname(require.resolve('go')), 'lib.esnext.asynciterable.d.ts'),
    ],
    module: ts.ModuleKind.ESNext,
  },
  isGox = false,
  isStrict = false
): void {
  if (process.env.SKIP_VALIDATION) {
    return;
  }

  if (isStrict) {
    options.strictNullChecks = true;
    options.strict = true;
    options.strictBindCallApply = true;
    options.strictPropertyInitialization = true;
    options.alwaysStrict = true;
    options.strictFunctionTypes = true;
  }

  const contents: string = typeof pluginOutput === 'string' ? pluginOutput : [...(pluginOutput.prepend || []), pluginOutput.content, ...(pluginOutput.append || [])].join('\n');
  const testFile = `test-file.${isGox ? 'tsx' : 'ts'}`;
  const result = ts.createSourceFile(testFile, contents, ts.ScriptTarget.ES2016, false, isGox ? ts.ScriptKind.TSX : undefined);

  if (result['parseDiagnostics'] && result['parseDiagnostics'].length > 0) {
    const errors = [];
    const allDiagnostics = result['parseDiagnostics'];

    allDiagnostics.forEach(diagnostic => {
      if (diagnostic.file) {
        let { line, character } = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start!);
        let message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
        errors.push(`${line + 1},${character + 1}: ${message} ->
    ${contents.split('\n')[line]}`);
      } else {
        errors.push(`${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`);
      }

      const relevantErrors = errors.filter(e => !e.includes('Cannot find module'));

      if (relevantErrors && relevantErrors.length > 0) {
        throw new Error(relevantErrors.join('\n'));
      }
    });
  }
}
