#!/usr/bin/env node

import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
import { readFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const ts = require("typescript")
const root = process.cwd()
const supportedModes = new Set(["all", "--check-example", "--check-docs"])

function trackedFiles() {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
    cwd: root,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean)
}

function lexicalScope(parent = null, kind = "block") {
  return { parent, kind, bindings: new Map() }
}

function findBinding(scope, name) {
  for (let current = scope; current; current = current.parent) {
    if (current.bindings.has(name)) return current.bindings.get(name)
  }
  return undefined
}

function updateBinding(scope, name, binding) {
  for (let current = scope; current; current = current.parent) {
    if (current.bindings.has(name)) {
      current.bindings.set(name, binding)
      return
    }
  }
  scope.bindings.set(name, binding)
}

function functionScope(scope) {
  for (let current = scope; current; current = current.parent) {
    if (current.kind === "function" || current.kind === "source") return current
  }
  return scope
}

function unwrapTypeScriptExpression(node) {
  let current = node
  while (
    current &&
    (ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isTypeAssertionExpression(current) ||
      ts.isNonNullExpression(current) ||
      ts.isSatisfiesExpression(current) ||
      ts.isPartiallyEmittedExpression(current))
  ) {
    current = current.expression
  }
  return current
}

export function scanJavaScriptSource(source, file = "<fixture>.ts") {
  const names = new Set()
  const unresolved = []
  const clientViolations = []
  const origins = new Map()
  const accountedOrigins = new Set()
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  let isClientFile = false
  for (const statement of sourceFile.statements) {
    if (!ts.isExpressionStatement(statement) || !ts.isStringLiteral(statement.expression)) break
    if (statement.expression.text === "use client") isClientFile = true
  }

  function staticString(node, scope) {
    node = unwrapTypeScriptExpression(node)
    if (!node) return undefined
    if (ts.isStringLiteralLike(node)) return node.text
    if (ts.isIdentifier(node)) {
      const binding = findBinding(scope, node.text)
      if (binding?.kind === "string") return binding.value
    }
    return undefined
  }

  function isProcessModuleName(node) {
    return ts.isStringLiteralLike(node) && (node.text === "node:process" || node.text === "process")
  }

  function isProcessRequireCall(node, scope) {
    node = unwrapTypeScriptExpression(node)
    return Boolean(
      node &&
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === "require" &&
        !findBinding(scope, "require") &&
        node.arguments.length === 1 &&
        isProcessModuleName(node.arguments[0]),
    )
  }

  function isGlobalProcessAccess(node, scope) {
    node = unwrapTypeScriptExpression(node)
    if (!node) return false
    if (ts.isPropertyAccessExpression(node) && node.name.text === "process") {
      const owner = unwrapTypeScriptExpression(node.expression)
      return ts.isIdentifier(owner) && owner.text === "globalThis" && !findBinding(scope, "globalThis")
    }
    if (ts.isElementAccessExpression(node) && staticString(node.argumentExpression, scope) === "process") {
      const owner = unwrapTypeScriptExpression(node.expression)
      return ts.isIdentifier(owner) && owner.text === "globalThis" && !findBinding(scope, "globalThis")
    }
    return false
  }

  function isProcessObject(node, scope) {
    node = unwrapTypeScriptExpression(node)
    if (!node) return false
    if (ts.isIdentifier(node)) {
      if (node.text === "process" && !findBinding(scope, "process")) return true
      return findBinding(scope, node.text)?.kind === "process"
    }
    return isGlobalProcessAccess(node, scope) || isProcessRequireCall(node, scope)
  }

  function isDirectEnvAccess(node, scope) {
    node = unwrapTypeScriptExpression(node)
    if (!node) return false
    if (ts.isPropertyAccessExpression(node)) {
      return node.name.text === "env" && isProcessObject(node.expression, scope)
    }
    return Boolean(
      ts.isElementAccessExpression(node) &&
        staticString(node.argumentExpression, scope) === "env" &&
        isProcessObject(node.expression, scope),
    )
  }

  function isEnvObject(node, scope) {
    node = unwrapTypeScriptExpression(node)
    if (!node) return false
    if (ts.isIdentifier(node)) return findBinding(scope, node.text)?.kind === "env"
    return isDirectEnvAccess(node, scope)
  }

  function trackOrigin(node, scope) {
    const current = unwrapTypeScriptExpression(node)
    if (!current) return
    if (ts.isImportDeclaration(current) && isProcessModuleName(current.moduleSpecifier)) {
      origins.set(current, "import de node:process sem binding conhecido")
    } else if (isProcessRequireCall(current, scope)) {
      origins.set(current, "require de node:process sem binding conhecido")
    } else if (isGlobalProcessAccess(current, scope)) {
      origins.set(current, "globalThis.process sem binding ou chave conhecida")
    } else if (isDirectEnvAccess(current, scope)) {
      origins.set(current, "process.env sem binding ou chave conhecida")
    }
  }

  function accountOriginTree(node, scope) {
    const current = unwrapTypeScriptExpression(node)
    if (!current) return
    if (
      isProcessRequireCall(current, scope) ||
      isGlobalProcessAccess(current, scope) ||
      isDirectEnvAccess(current, scope)
    ) {
      accountedOrigins.add(current)
    }
    if (isDirectEnvAccess(current, scope)) accountOriginTree(current.expression, scope)
  }

  function isStaticObjectAssignFromEnv(node, scope) {
    node = unwrapTypeScriptExpression(node)
    if (!node || !ts.isCallExpression(node) || node.arguments.length !== 2) return false
    const callee = unwrapTypeScriptExpression(node.expression)
    if (
      !ts.isPropertyAccessExpression(callee) ||
      callee.name.text !== "assign" ||
      !ts.isIdentifier(callee.expression) ||
      callee.expression.text !== "Object" ||
      findBinding(scope, "Object")
    ) {
      return false
    }
    const target = unwrapTypeScriptExpression(node.arguments[0])
    return Boolean(
      target &&
        ts.isObjectLiteralExpression(target) &&
        target.properties.length === 0 &&
        isEnvObject(node.arguments[1], scope),
    )
  }

  function bindingFor(node, scope) {
    if (!node) return { kind: "other" }
    node = unwrapTypeScriptExpression(node)
    if (isProcessObject(node, scope)) {
      accountOriginTree(node, scope)
      return { kind: "process" }
    }
    if (isEnvObject(node, scope)) {
      accountOriginTree(node, scope)
      return { kind: "env" }
    }
    if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) &&
      isEnvObject(node.left, scope)
    ) {
      accountOriginTree(node.left, scope)
      return { kind: "env" }
    }
    if (
      ts.isObjectLiteralExpression(node) &&
      node.properties.some(
        (property) => ts.isSpreadAssignment(property) && isEnvObject(property.expression, scope),
      )
    ) {
      for (const property of node.properties) {
        if (ts.isSpreadAssignment(property) && isEnvObject(property.expression, scope)) {
          accountOriginTree(property.expression, scope)
        }
      }
      return { kind: "env" }
    }
    if (isStaticObjectAssignFromEnv(node, scope)) {
      accountOriginTree(node.arguments[1], scope)
      return { kind: "env" }
    }
    const value = staticString(node, scope)
    if (value !== undefined) return { kind: "string", value }
    return { kind: "other" }
  }

  function recordName(name, node) {
    names.add(name)
    if (isClientFile && name !== "NODE_ENV" && !name.startsWith("NEXT_PUBLIC_")) {
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
      clientViolations.push(`${file}:${line}:${name}`)
    }
  }

  function declarePattern(name, scope) {
    if (ts.isIdentifier(name)) {
      if (!scope.bindings.has(name.text)) scope.bindings.set(name.text, { kind: "other" })
      return
    }
    if (!ts.isObjectBindingPattern(name) && !ts.isArrayBindingPattern(name)) return
    for (const element of name.elements) {
      if (ts.isOmittedExpression(element)) continue
      declarePattern(element.name, scope)
    }
  }

  function bindPattern(name, initializer, scope, declarationKind = "lexical") {
    const targetScope = declarationKind === "var" ? functionScope(scope) : scope
    if (ts.isIdentifier(name)) {
      targetScope.bindings.set(name.text, bindingFor(initializer, scope))
      return
    }
    if (!ts.isObjectBindingPattern(name)) {
      if (ts.isArrayBindingPattern(name)) {
        for (const element of name.elements) {
          if (!ts.isOmittedExpression(element)) bindPattern(element.name, undefined, targetScope)
        }
      }
      return
    }

    const fromProcess = initializer && isProcessObject(initializer, scope)
    const fromEnv = initializer && isEnvObject(initializer, scope)

    function bindEnvPattern(pattern) {
      if (!ts.isObjectBindingPattern(pattern)) {
        const line = sourceFile.getLineAndCharacterOfPosition(pattern.getStart(sourceFile)).line + 1
        unresolved.push(`${file}:${line}:unsupported nested env destructuring`)
        declarePattern(pattern, targetScope)
        return
      }
      for (const nested of pattern.elements) {
        const property = nested.propertyName ?? nested.name
        const propertyName = ts.isComputedPropertyName(property)
          ? staticString(property.expression, scope)
          : ts.isIdentifier(property) || ts.isStringLiteralLike(property)
            ? property.text
            : undefined
        if (nested.dotDotDotToken || !propertyName) {
          const line = sourceFile.getLineAndCharacterOfPosition(nested.getStart(sourceFile)).line + 1
          unresolved.push(`${file}:${line}:dynamic nested env destructuring`)
        } else {
          recordName(propertyName, nested)
        }
        declarePattern(nested.name, targetScope)
      }
    }

    for (const element of name.elements) {
      const property = element.propertyName ?? element.name
      const propertyName = ts.isComputedPropertyName(property)
        ? staticString(property.expression, scope)
        : ts.isIdentifier(property) || ts.isStringLiteralLike(property)
          ? property.text
          : undefined
      if (fromProcess && propertyName === "env") {
        if (ts.isIdentifier(element.name)) {
          targetScope.bindings.set(element.name.text, { kind: "env" })
        } else {
          bindEnvPattern(element.name)
        }
      } else {
        if (fromEnv && propertyName) recordName(propertyName, element)
        declarePattern(element.name, targetScope)
        if (ts.isIdentifier(element.name)) {
          targetScope.bindings.set(element.name.text, { kind: "other" })
        }
      }
    }
  }

  function variableKind(declaration) {
    const flags = declaration.parent?.flags ?? ts.NodeFlags.None
    return flags & (ts.NodeFlags.Let | ts.NodeFlags.Const) ? "lexical" : "var"
  }

  function predeclareLexicalStatements(statements, scope) {
    for (const statement of statements) {
      if (ts.isVariableStatement(statement)) {
        const flags = statement.declarationList.flags
        if (flags & (ts.NodeFlags.Let | ts.NodeFlags.Const)) {
          for (const declaration of statement.declarationList.declarations) {
            declarePattern(declaration.name, scope)
          }
        }
      } else if (
        (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
        statement.name
      ) {
        declarePattern(statement.name, scope)
      } else if (ts.isImportDeclaration(statement) && statement.importClause) {
        const moduleName = ts.isStringLiteralLike(statement.moduleSpecifier)
          ? statement.moduleSpecifier.text
          : undefined
        const processModule = moduleName === "node:process" || moduleName === "process"
        let bindsProcess = false
        if (statement.importClause.name) {
          scope.bindings.set(
            statement.importClause.name.text,
            processModule ? { kind: "process" } : { kind: "other" },
          )
          if (processModule) bindsProcess = true
        }
        const bindings = statement.importClause.namedBindings
        if (bindings && ts.isNamespaceImport(bindings)) {
          scope.bindings.set(bindings.name.text, processModule ? { kind: "process" } : { kind: "other" })
          if (processModule) bindsProcess = true
        }
        if (bindings && ts.isNamedImports(bindings)) {
          for (const element of bindings.elements) declarePattern(element.name, scope)
        }
        if (bindsProcess) accountedOrigins.add(statement)
      }
    }
  }

  function predeclareVars(node, scope, rootNode = node) {
    if (node !== rootNode && ts.isFunctionLike(node)) return
    if (ts.isVariableDeclarationList(node) && !(node.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const))) {
      for (const declaration of node.declarations) declarePattern(declaration.name, scope)
    }
    ts.forEachChild(node, (child) => predeclareVars(child, scope, rootNode))
  }

  function visit(node, scope) {
    trackOrigin(node, scope)
    if (ts.isSourceFile(node)) {
      scope.kind = "source"
      predeclareLexicalStatements(node.statements, scope)
      predeclareVars(node, scope)
      for (const statement of node.statements) visit(statement, scope)
      return
    }
    if (ts.isBlock(node)) {
      const blockScope = lexicalScope(scope)
      predeclareLexicalStatements(node.statements, blockScope)
      for (const statement of node.statements) visit(statement, blockScope)
      return
    }
    if (ts.isFunctionLike(node)) {
      if ("name" in node && node.name && ts.isIdentifier(node.name)) {
        scope.bindings.set(node.name.text, { kind: "other" })
      }
      const nestedFunctionScope = lexicalScope(scope, "function")
      for (const parameter of node.parameters) {
        if (parameter.initializer) visit(parameter.initializer, scope)
        declarePattern(parameter.name, nestedFunctionScope)
        bindPattern(parameter.name, parameter.initializer, nestedFunctionScope)
      }
      if (node.body) {
        predeclareVars(node.body, nestedFunctionScope)
        visit(node.body, nestedFunctionScope)
      }
      return
    }
    if (ts.isVariableDeclaration(node)) {
      if (node.initializer) visit(node.initializer, scope)
      bindPattern(node.name, node.initializer, scope, variableKind(node))
      return
    }
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isIdentifier(node.left)
    ) {
      visit(node.right, scope)
      updateBinding(scope, node.left.text, bindingFor(node.right, scope))
      return
    }
    if (ts.isCatchClause(node)) {
      const catchScope = lexicalScope(scope)
      if (node.variableDeclaration) {
        declarePattern(node.variableDeclaration.name, catchScope)
        bindPattern(node.variableDeclaration.name, undefined, catchScope)
      }
      visit(node.block, catchScope)
      return
    }
    if (ts.isForStatement(node) || ts.isForInStatement(node) || ts.isForOfStatement(node)) {
      const loopScope = lexicalScope(scope)
      ts.forEachChild(node, (child) => visit(child, loopScope))
      return
    }
    if (ts.isSwitchStatement(node)) {
      const switchScope = lexicalScope(scope)
      visit(node.expression, scope)
      for (const clause of node.caseBlock.clauses) {
        if (clause.expression) visit(clause.expression, switchScope)
        predeclareLexicalStatements(clause.statements, switchScope)
        for (const statement of clause.statements) visit(statement, switchScope)
      }
      return
    }
    if (ts.isSpreadAssignment(node) && isEnvObject(node.expression, scope)) {
      accountOriginTree(node.expression, scope)
    }
    if (ts.isPropertyAccessExpression(node) && isEnvObject(node.expression, scope)) {
      accountOriginTree(node.expression, scope)
      recordName(node.name.text, node)
    }
    if (ts.isElementAccessExpression(node)) {
      if (isEnvObject(node.expression, scope)) {
        const key = staticString(node.argumentExpression, scope)
        if (key) {
          accountOriginTree(node.expression, scope)
          recordName(key, node)
        }
        else {
          const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
          unresolved.push(`${file}:${line}:dynamic env key`)
        }
      } else if (isProcessObject(node.expression, scope)) {
        const key = staticString(node.argumentExpression, scope)
        if (key === undefined) {
          const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
          unresolved.push(`${file}:${line}:dynamic process key`)
        }
      }
    }
    ts.forEachChild(node, (child) => visit(child, scope))
  }

  visit(sourceFile, lexicalScope(null, "source"))
  for (const [node, reason] of origins) {
    if (accountedOrigins.has(node)) continue
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1
    unresolved.push(`${file}:${line}:${reason}`)
  }
  return { names, unresolved, clientViolations }
}

function scanJavaScript(files) {
  const names = new Set()
  const unresolved = []
  const clientViolations = []
  for (const file of files.filter((entry) => /\.(?:[cm]?[jt]sx?)$/.test(entry))) {
    const source = readFileSync(path.join(root, file), "utf8")
    const result = scanJavaScriptSource(source, file)
    for (const name of result.names) names.add(name)
    unresolved.push(...result.unresolved)
    clientViolations.push(...result.clientViolations)
  }

  const allowedDynamicPrefixes = [
    "scripts/audit/auditar-classificacao-eleitoral.ts:",
    "scripts/audit/check-candidatura-resultados.ts:",
    "scripts/audit/congelar-sobreposicoes.ts:",
    "scripts/curate-contradictions-evidence.mjs:",
    "scripts/merge-queue/adapters.mjs:",
    "tests/",
  ]
  const unexpectedDynamic = unresolved.filter(
    (entry) => !allowedDynamicPrefixes.some((prefix) => entry.startsWith(prefix)),
  )
  if (unexpectedDynamic.length > 0) {
    throw new Error(`acessos dinâmicos a process.env sem classificação: ${unexpectedDynamic.join(", ")}`)
  }
  if (clientViolations.length > 0) {
    throw new Error(
      `variáveis server-only em arquivo use client: ${clientViolations.sort().join(", ")}`,
    )
  }

  return names
}

const pythonAstHelper = String.raw`
import ast
import json
import re
import sys

ENV_KEY = re.compile(r"^[A-Z][A-Z0-9_]*$")

class Analyzer(ast.NodeVisitor):
    def __init__(self, file):
        self.file = file
        self.names = set()
        self.unresolved = []
        self.scopes = [{}]
        self.current_function = None
        self.sinks = {}
        self.sink_calls = {}

    def find(self, name):
        for scope in reversed(self.scopes):
            if name in scope:
                return scope[name]
        return ("other",)

    def bind(self, name, value):
        self.scopes[-1][name] = value

    def static_string(self, node):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            return node.value
        if isinstance(node, ast.Name):
            value = self.find(node.id)
            if value[0] == "string":
                return value[1]
        return None

    def kind(self, node):
        if isinstance(node, ast.Name):
            return self.find(node.id)
        if isinstance(node, ast.Attribute):
            owner = self.kind(node.value)
            if owner[0] == "os" and node.attr == "environ":
                return ("environ",)
            if owner[0] == "os" and node.attr == "getenv":
                return ("getenv",)
            if owner[0] == "environ" and node.attr == "get":
                return ("getenv",)
        value = self.static_string(node)
        if value is not None:
            return ("string", value)
        return ("other",)

    def fail(self, node, reason):
        self.unresolved.append(f"{self.file}:{getattr(node, 'lineno', 1)}:{reason}")

    def record_key(self, node, key):
        if key is None or not ENV_KEY.fullmatch(key):
            self.fail(node, "dynamic Python environment key")
        else:
            self.names.add(key)

    def bind_target(self, target, value):
        if isinstance(target, ast.Name):
            self.bind(target.id, value)
        elif isinstance(target, (ast.Tuple, ast.List)):
            for element in target.elts:
                self.bind_target(element, ("other",))

    def visit_Import(self, node):
        for alias in node.names:
            if alias.name == "os":
                self.bind(alias.asname or "os", ("os",))

    def visit_ImportFrom(self, node):
        if node.module != "os":
            return
        for alias in node.names:
            if alias.name == "*":
                self.fail(node, "wildcard import from os")
            elif alias.name == "environ":
                self.bind(alias.asname or alias.name, ("environ",))
            elif alias.name == "getenv":
                self.bind(alias.asname or alias.name, ("getenv",))

    def visit_Assign(self, node):
        value = self.kind(node.value)
        if value[0] == "other":
            self.visit(node.value)
        for target in node.targets:
            self.bind_target(target, value)

    def visit_AnnAssign(self, node):
        value = self.kind(node.value) if node.value is not None else ("other",)
        if node.value is not None and value[0] == "other":
            self.visit(node.value)
        self.bind_target(node.target, value)

    def visit_NamedExpr(self, node):
        value = self.kind(node.value)
        if value[0] == "other":
            self.visit(node.value)
        self.bind_target(node.target, value)

    def receiver_kind(self, node):
        if isinstance(node, ast.NamedExpr):
            self.visit_NamedExpr(node)
            return self.kind(node.target)
        return self.kind(node)

    def visit_FunctionDef(self, node):
        self.bind(node.name, ("function", node.name))
        previous = self.current_function
        self.current_function = node.name
        positional = [*node.args.posonlyargs, *node.args.args]
        parameters = [*positional, *node.args.kwonlyargs]
        parameter_bindings = {
            parameter.arg: ("parameter", index) for index, parameter in enumerate(parameters)
        }
        positional_defaults = [None] * (len(positional) - len(node.args.defaults)) + list(node.args.defaults)
        for parameter, default in zip(positional, positional_defaults):
            if default is None:
                continue
            value = self.kind(default)
            if value[0] == "other":
                self.visit(default)
            else:
                parameter_bindings[parameter.arg] = value
        for parameter, default in zip(node.args.kwonlyargs, node.args.kw_defaults):
            if default is None:
                continue
            value = self.kind(default)
            if value[0] == "other":
                self.visit(default)
            else:
                parameter_bindings[parameter.arg] = value
        if node.args.vararg:
            parameter_bindings[node.args.vararg.arg] = ("other",)
        if node.args.kwarg:
            parameter_bindings[node.args.kwarg.arg] = ("other",)
        self.scopes.append(parameter_bindings)
        for statement in node.body:
            self.visit(statement)
        self.scopes.pop()
        self.current_function = previous

    visit_AsyncFunctionDef = visit_FunctionDef

    def visit_Subscript(self, node):
        if self.receiver_kind(node.value)[0] == "environ":
            key = self.static_string(node.slice)
            if isinstance(node.slice, ast.Name) and self.find(node.slice.id)[0] == "parameter" and self.current_function:
                index = self.find(node.slice.id)[1]
                self.sinks.setdefault(self.current_function, set()).add(index)
            else:
                self.record_key(node, key)
            return
        self.generic_visit(node)

    def visit_Call(self, node):
        accessor = None
        if isinstance(node.func, ast.Attribute) and node.func.attr == "get" and self.receiver_kind(node.func.value)[0] == "environ":
            accessor = "environ.get"
        elif self.receiver_kind(node.func)[0] == "getenv":
            accessor = "getenv"

        if accessor:
            if not node.args:
                self.fail(node, f"{accessor} without key")
            elif isinstance(node.args[0], ast.Name) and self.find(node.args[0].id)[0] == "parameter" and self.current_function:
                index = self.find(node.args[0].id)[1]
                self.sinks.setdefault(self.current_function, set()).add(index)
            else:
                self.record_key(node, self.static_string(node.args[0]))
            for argument in node.args[1:]:
                self.visit(argument)
            for keyword in node.keywords:
                self.visit(keyword.value)
            return

        if isinstance(node.func, ast.Name) and node.func.id == "getattr" and node.args and self.kind(node.args[0])[0] in {"os", "environ"}:
            self.fail(node, "dynamic Python environment accessor")
            return
        if isinstance(node.func, ast.Name) and node.func.id == "__import__" and node.args and self.static_string(node.args[0]) == "os":
            self.fail(node, "dynamic import of os")
            return

        callee = self.kind(node.func)
        if callee[0] == "function" and callee[1] in self.sinks:
            self.sink_calls[callee[1]] = self.sink_calls.get(callee[1], 0) + 1
            for index in self.sinks[callee[1]]:
                argument = node.args[index] if index < len(node.args) else None
                self.record_key(node, self.static_string(argument) if argument is not None else None)
            for argument in node.args:
                self.visit(argument)
            for keyword in node.keywords:
                self.visit(keyword.value)
            return
        self.generic_visit(node)

    def visit_Name(self, node):
        if isinstance(node.ctx, ast.Load) and self.find(node.id)[0] in {"environ", "getenv"}:
            self.fail(node, "bare Python environment accessor")

    def visit_Attribute(self, node):
        if self.kind(node)[0] in {"environ", "getenv"}:
            self.fail(node, "bare Python environment accessor")
            return
        if node.attr in {"environ", "getenv"}:
            self.fail(node, "unresolved Python environment accessor owner")
            return
        self.generic_visit(node)

    def finish(self):
        for function, indexes in self.sinks.items():
            if indexes and not self.sink_calls.get(function):
                self.unresolved.append(f"{self.file}:1:environment accessor in {function} has no statically resolved calls")

results = {"names": [], "unresolved": []}
for item in json.load(sys.stdin):
    try:
        tree = ast.parse(item["source"], filename=item["file"])
    except SyntaxError as error:
        results["unresolved"].append(f"{item['file']}:{error.lineno or 1}:Python syntax error")
        continue
    analyzer = Analyzer(item["file"])
    analyzer.visit(tree)
    analyzer.finish()
    results["names"].extend(analyzer.names)
    results["unresolved"].extend(analyzer.unresolved)
results["names"] = sorted(set(results["names"]))
print(json.dumps(results))
`

function scanPythonSources(sources) {
  const output = execFileSync("python3", ["-c", pythonAstHelper], {
    cwd: root,
    encoding: "utf8",
    input: JSON.stringify(sources),
  })
  const result = JSON.parse(output)
  if (result.unresolved.length > 0) {
    throw new Error(`acessos Python a ambiente sem resolução estática: ${result.unresolved.join(", ")}`)
  }
  return new Set(result.names)
}

export function scanPythonSource(source, file = "<fixture>.py") {
  return scanPythonSources([{ file, source }])
}

function scanPython(files) {
  return scanPythonSources(
    files
      .filter((entry) => entry.endsWith(".py"))
      .map((file) => ({ file, source: readFileSync(path.join(root, file), "utf8") })),
  )
}

export function scanShellSource(source) {
  const names = new Set()
  let singleQuoted = false
  let doubleQuoted = false
  let commented = false
  let sanitized = ""
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]
    const previous = index === 0 ? "\n" : source[index - 1]
    if (character === "\n") {
      commented = false
      sanitized += character
      continue
    }
    if (commented) {
      sanitized += " "
      continue
    }
    if (singleQuoted) {
      if (character === "'") singleQuoted = false
      sanitized += character === "$" ? " " : character
      continue
    }
    if (character === "'" && !doubleQuoted) {
      singleQuoted = true
      sanitized += character
      continue
    }
    if (character === '"' && previous !== "\\") doubleQuoted = !doubleQuoted
    if (character === "#" && !doubleQuoted && /\s/.test(previous)) {
      commented = true
      sanitized += " "
      continue
    }
    sanitized += character
  }

  function parseCommandSubstitution(text, start) {
    let single = false
    let double = false
    let parentheses = 0
    let content = ""
    for (let index = start; index < text.length; index += 1) {
      const character = text[index]
      const previous = index === start ? "" : text[index - 1]
      if (character === "'" && !double) {
        single = !single
        content += character
        continue
      }
      if (character === '"' && !single && previous !== "\\") {
        double = !double
        content += character
        continue
      }
      if (!single && text.slice(index, index + 2) === "$(") {
        const inner = parseCommandSubstitution(text, index + 2)
        content += `$(${inner.content})`
        index = inner.end
        continue
      }
      if (!single && !double && character === "(") {
        parentheses += 1
        content += character
        continue
      }
      if (!single && !double && character === ")") {
        if (parentheses > 0) {
          parentheses -= 1
          content += character
          continue
        }
        return { content, end: index }
      }
      content += character
    }
    throw new Error(`substituição shell sem fechamento: ${text.trim()}`)
  }

  function parseBacktick(text, start) {
    let content = ""
    for (let index = start; index < text.length; index += 1) {
      const character = text[index]
      const previous = index === start ? "" : text[index - 1]
      if (character === "`" && previous !== "\\") return { content, end: index }
      content += character
    }
    throw new Error(`backtick shell sem fechamento: ${text.trim()}`)
  }

  function commands() {
    const result = []
    let current = ""
    let single = false
    let double = false
    for (let index = 0; index < sanitized.length; index += 1) {
      const character = sanitized[index]
      const previous = index === 0 ? "" : sanitized[index - 1]
      if (!single && character === "`" && previous !== "\\") {
        const parsed = parseBacktick(sanitized, index + 1)
        current += `\`${parsed.content}\``
        index = parsed.end
        continue
      }
      if (!single && sanitized.slice(index, index + 2) === "$(") {
        const parsed = parseCommandSubstitution(sanitized, index + 2)
        current += `$(${parsed.content})`
        index = parsed.end
        continue
      }
      if (!single && !double && /[<>]/.test(character) && sanitized[index + 1] === "(") {
        const parsed = parseCommandSubstitution(sanitized, index + 2)
        current += `${character}(${parsed.content})`
        index = parsed.end
        continue
      }
      if (character === "'" && !double) single = !single
      if (character === '"' && !single && previous !== "\\") double = !double
      const pair = sanitized.slice(index, index + 2)
      if (
        !single &&
        !double &&
        (character === "\n" ||
          character === ";" ||
          pair === "&&" ||
          pair === "||" ||
          (character === "|" && sanitized[index + 1] !== "|"))
      ) {
        if (current.trim()) result.push(current)
        current = ""
        if (pair === "&&" || pair === "||") index += 1
        continue
      }
      current += character
    }
    if (current.trim()) result.push(current)
    return result
  }

  function words(command) {
    const result = []
    let current = ""
    let single = false
    let double = false
    let substitutionDepth = 0
    for (let index = 0; index < command.length; index += 1) {
      const character = command[index]
      const previous = index === 0 ? "" : command[index - 1]
      if (!single && character === "`" && previous !== "\\") {
        const parsed = parseBacktick(command, index + 1)
        current += `\`${parsed.content}\``
        index = parsed.end
        continue
      }
      if (!single && command.slice(index, index + 2) === "$(") {
        const parsed = parseCommandSubstitution(command, index + 2)
        current += `$(${parsed.content})`
        index = parsed.end
        continue
      }
      if (!single && !double && /[<>]/.test(character) && command[index + 1] === "(") {
        const parsed = parseCommandSubstitution(command, index + 2)
        current += `${character}(${parsed.content})`
        index = parsed.end
        continue
      }
      if (character === "'" && !double) single = !single
      if (character === '"' && !single && previous !== "\\") double = !double
      if (!single && command.slice(index, index + 2) === "$(") substitutionDepth += 1
      if (!single && character === ")" && substitutionDepth > 0) substitutionDepth -= 1
      if (!single && !double && substitutionDepth === 0 && /\s/.test(character)) {
        if (current) result.push(current)
        current = ""
        continue
      }
      current += character
    }
    if (current) result.push(current)
    return result
  }

  function persistentAssignments(command) {
    const tokens = words(command)
    if (tokens.length === 0) return []
    if (["export", "local", "readonly"].includes(tokens[0])) tokens.shift()
    if (tokens[0] === "declare") {
      tokens.shift()
      while (tokens[0]?.startsWith("-")) tokens.shift()
    }
    const assignments = tokens.filter((token) => /^[A-Z][A-Z0-9_]*\+?=/.test(token))
    return assignments.length === tokens.length
      ? assignments.map((token) => /^([A-Z][A-Z0-9_]*)/.exec(token)[1])
      : []
  }

  function literalWord(token) {
    if (/^[^'"$`\\\s]+$/.test(token)) return token
    const single = /^'([^']*)'$/.exec(token)
    if (single) return single[1]
    const double = /^"([^"$`\\]*)"$/.exec(token)
    if (double) return double[1]
    return undefined
  }

  function executableBasename(token) {
    return path.posix.basename(literalWord(token) ?? "")
  }

  function commandWords(command) {
    const tokens = words(command)
    let index = 0
    while (/^[A-Za-z_][A-Za-z0-9_]*\+?=/.test(tokens[index] ?? "")) index += 1
    const wrappers = new Set(["builtin", "command", "exec", "nohup", "sudo"])
    while (wrappers.has(literalWord(tokens[index]))) index += 1
    if (executableBasename(tokens[index]) === "env") {
      index += 1
      while (/^(?:-[^-].*|--[^=].*|[A-Za-z_][A-Za-z0-9_]*=)/.test(tokens[index] ?? "")) {
        index += 1
      }
    }
    return tokens.slice(index)
  }

  function executableAfterControl(tokens) {
    let index = 0
    while (/^[A-Za-z_][A-Za-z0-9_]*\+?=/.test(tokens[index] ?? "")) index += 1
    const wrappers = new Set(["builtin", "command", "exec", "nohup", "sudo"])
    while (wrappers.has(literalWord(tokens[index]))) index += 1
    if (executableBasename(tokens[index]) === "env") {
      index += 1
      while (/^(?:-[^-].*|--[^=].*|[A-Za-z_][A-Za-z0-9_]*=)/.test(tokens[index] ?? "")) {
        index += 1
      }
    }
    return path.posix.basename(literalWord(tokens[index]) ?? "")
  }

  function nestedCommandSources(command) {
    const nested = []
    for (let index = 0; index < command.length; index += 1) {
      if (command.slice(index, index + 2) === "$(") {
        const parsed = parseCommandSubstitution(command, index + 2)
        nested.push(parsed.content)
        index = parsed.end
      }
    }
    return nested
  }

  function backtickSources(command) {
    const nested = []
    let single = false
    for (let index = 0; index < command.length; index += 1) {
      const character = command[index]
      const previous = index === 0 ? "" : command[index - 1]
      if (character === "'" && previous !== "\\") single = !single
      if (!single && character === "`" && previous !== "\\") {
        const parsed = parseBacktick(command, index + 1)
        nested.push(parsed.content)
        index = parsed.end
      }
    }
    return nested
  }

  function processSubstitutionSources(command) {
    const nested = []
    let single = false
    let double = false
    for (let index = 0; index < command.length; index += 1) {
      const character = command[index]
      const previous = index === 0 ? "" : command[index - 1]
      if (character === "'" && !double && previous !== "\\") single = !single
      if (character === '"' && !single && previous !== "\\") double = !double
      if (!single && !double && /[<>]/.test(character) && command[index + 1] === "(") {
        const parsed = parseCommandSubstitution(command, index + 2)
        nested.push(parsed.content)
        index = parsed.end
      }
    }
    return nested
  }

  function rejectEnvironmentDump(command) {
    function checkTokens(tokens) {
      let index = 0
      while (/^[A-Za-z_][A-Za-z0-9_]*\+?=/.test(tokens[index] ?? "")) index += 1
      const wrappers = new Set(["builtin", "command", "exec", "nohup", "sudo"])
      while (wrappers.has(literalWord(tokens[index]))) index += 1
      if (executableBasename(tokens[index]) !== "env") return
      index += 1
      while (index < tokens.length) {
        const token = literalWord(tokens[index])
        if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token ?? "")) {
          index += 1
          continue
        }
        if (["-u", "-C", "-S", "--unset", "--chdir", "--split-string"].includes(token)) {
          index += 2
          continue
        }
        if (token === "--") {
          index += 1
          break
        }
        if (token?.startsWith("-")) {
          index += 1
          continue
        }
        break
      }
      if (index >= tokens.length) {
        throw new Error(`env sem comando expõe ambiente completo: ${command.trim()}`)
      }
    }

    const tokens = words(command)
    checkTokens(tokens)
    const controlWords = new Set(["!", "do", "elif", "else", "if", "then", "until", "while"])
    for (let index = 0; index < tokens.length; index += 1) {
      if (controlWords.has(literalWord(tokens[index]))) checkTokens(tokens.slice(index + 1))
    }
  }

  function recordNameref(command) {
    const tokens = commandWords(command)
    const executable = path.posix.basename(literalWord(tokens[0]) ?? "")
    if (!new Set(["declare", "local", "typeset"]).has(executable)) return
    let index = 1
    let nameref = false
    while (tokens[index]?.startsWith("-")) {
      const option = literalWord(tokens[index]) ?? ""
      if (option === "--reference" || /^-[A-Za-z]*n[A-Za-z]*$/.test(option)) nameref = true
      index += 1
    }
    if (!nameref) return
    if (index >= tokens.length) {
      throw new Error(`nameref shell sem alvo literal: ${command.trim()}`)
    }
    for (; index < tokens.length; index += 1) {
      const assignment = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(tokens[index])
      if (!assignment) {
        throw new Error(`nameref shell sem alvo literal: ${tokens[index]}`)
      }
      const target = assignment ? literalWord(assignment[2]) : undefined
      if (!target || (!/^[A-Z][A-Z0-9_]*$/.test(target) && !locals.has(target))) {
        throw new Error(`nameref shell com alvo não resolvido: ${tokens[index]}`)
      }
      if (!locals.has(target)) names.add(target)
    }
  }

  function rejectReevaluation(command) {
    const tokens = commandWords(command)
    const executable = path.posix.basename(literalWord(tokens[0]) ?? "")
    if (executable === "eval") {
      throw new Error(`reavaliação shell não inventariável: ${command.trim()}`)
    }
    const rawTokens = words(command)
    const controlWords = new Set(["!", "do", "elif", "else", "if", "then", "until", "while"])
    for (let index = 0; index < rawTokens.length; index += 1) {
      if (!controlWords.has(literalWord(rawTokens[index]))) continue
      if (executableAfterControl(rawTokens.slice(index + 1)) === "eval") {
        throw new Error(`reavaliação shell não inventariável: ${command.trim()}`)
      }
    }
    const shells = new Set(["bash", "dash", "ksh", "sh", "zsh"])
    for (let index = 0; index < tokens.length - 1; index += 1) {
      const candidate = path.posix.basename(literalWord(tokens[index]) ?? "")
      const option = literalWord(tokens[index + 1])
      if (shells.has(candidate) && /^-[A-Za-z]*c[A-Za-z]*$/.test(option ?? "")) {
        const script = literalWord(tokens[index + 2])
        if (script === undefined) {
          throw new Error(`reavaliação shell não inventariável: ${command.trim()}`)
        }
        for (const name of scanShellSource(script)) names.add(name)
      }
    }
  }

  function recordPrintenv(command) {
    const tokens = commandWords(command)
    const executable = path.posix.basename(literalWord(tokens[0]) ?? "")
    if (executable !== "printenv") return
    let index = 1
    while (tokens[index]?.startsWith("-") && tokens[index] !== "--") index += 1
    if (tokens[index] === "--") index += 1
    if (index >= tokens.length) {
      throw new Error(`printenv sem chaves literais inventariáveis: ${command.trim()}`)
    }
    for (; index < tokens.length; index += 1) {
      const key = literalWord(tokens[index])
      if (!key || !/^[A-Z][A-Z0-9_]*$/.test(key)) {
        throw new Error(`printenv com chave dinâmica: ${tokens[index]}`)
      }
      if (!locals.has(key)) names.add(key)
    }
  }

  const locals = new Set()
  for (const command of commands()) {
    const nestedSources = [
      ...nestedCommandSources(command),
      ...backtickSources(command),
      ...processSubstitutionSources(command),
    ]
    for (const nested of nestedSources) {
      for (const name of scanShellSource(nested)) {
        if (!locals.has(name)) names.add(name)
      }
    }
    rejectEnvironmentDump(command)
    rejectReevaluation(command)
    const indirect = [
      ...command.matchAll(/(?<!\\)\$\{!([A-Za-z_][A-Za-z0-9_]*)(?:\}|[?*@])/g),
    ]
    if (indirect.length > 0) {
      throw new Error(
        `expansão shell indireta sem resolução estática: ${indirect.map((match) => match[1]).join(", ")}`,
      )
    }
    for (const match of command.matchAll(/(?<!\\)\$\{([A-Z][A-Z0-9_]*)(?=[:}?+\-=])/g)) {
      if (!locals.has(match[1])) names.add(match[1])
    }
    for (const match of command.matchAll(/(?<![\\$])\$([A-Z][A-Z0-9_]*)\b/g)) {
      if (!locals.has(match[1])) names.add(match[1])
    }
    for (const match of command.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
      names.add(match[1])
    }
    recordNameref(command)
    recordPrintenv(command)
    for (const name of persistentAssignments(command)) locals.add(name)
  }

  return names
}

function scanShell(files) {
  const names = new Set()
  for (const file of files.filter((entry) => entry.endsWith(".sh"))) {
    const source = readFileSync(path.join(root, file), "utf8")
    for (const name of scanShellSource(source)) names.add(name)
  }
  return names
}

function workflowRunBlocks(source) {
  const lines = source.split(/\r?\n/)
  const blocks = []

  for (let index = 0; index < lines.length; index += 1) {
    const match = /^(\s*)(?:-\s+)?run\s*:\s*(.*)$/.exec(lines[index])
    if (!match) continue

    const runIndent = match[1].length
    const value = match[2].trim()
    if (value && !/^[>|][+-]?$/.test(value)) {
      if (value.startsWith("'") && value.endsWith("'")) {
        blocks.push(value.slice(1, -1).replace(/''/g, "'"))
      } else if (value.startsWith('"') && value.endsWith('"')) {
        try {
          blocks.push(JSON.parse(value))
        } catch {
          throw new Error(`run inline YAML com aspas inválidas: ${value}`)
        }
      } else {
        blocks.push(value)
      }
      continue
    }

    const blockLines = []
    let contentIndent = null
    for (index += 1; index < lines.length; index += 1) {
      const line = lines[index]
      const indent = /^\s*/.exec(line)[0].length
      if (line.trim() && indent <= runIndent) {
        index -= 1
        break
      }
      if (line.trim() && contentIndent === null) contentIndent = indent
      blockLines.push(line)
    }
    const strip = contentIndent ?? runIndent + 2
    const normalized = blockLines.map((line) => line.slice(Math.min(strip, line.length)))
    blocks.push(value.startsWith(">") ? normalized.join(" ") : normalized.join("\n"))
  }

  return blocks
}

function actionExpressionTokens(expression) {
  const tokens = []
  for (let index = 0; index < expression.length; ) {
    const character = expression[index]
    if (/\s/.test(character)) {
      index += 1
      continue
    }
    if (character === "'" || character === '"') {
      const quote = character
      let value = ""
      index += 1
      let closed = false
      while (index < expression.length) {
        const current = expression[index]
        if (current === quote) {
          if (quote === "'" && expression[index + 1] === "'") {
            value += "'"
            index += 2
            continue
          }
          closed = true
          index += 1
          break
        }
        if (current === "\\" && index + 1 < expression.length) {
          value += expression[index + 1]
          index += 2
          continue
        }
        value += current
        index += 1
      }
      if (!closed) throw new Error("string sem fechamento em expressão de Actions")
      tokens.push({ type: "string", value })
      continue
    }
    const identifier = /^[A-Za-z_][A-Za-z0-9_]*/.exec(expression.slice(index))
    if (identifier) {
      tokens.push({ type: "identifier", value: identifier[0] })
      index += identifier[0].length
      continue
    }
    tokens.push({ type: "punctuation", value: character })
    index += 1
  }
  return tokens
}

function actionExpressions(source) {
  const expressions = []
  for (let index = 0; index < source.length; index += 1) {
    if (source.slice(index, index + 3) !== "${{") continue
    const start = index
    index += 3
    let expression = ""
    let quote = null
    let closed = false
    for (; index < source.length; index += 1) {
      const character = source[index]
      if (quote) {
        if (character === quote) {
          if (quote === "'" && source[index + 1] === "'") {
            expression += "''"
            index += 1
            continue
          }
          quote = null
        }
        if (character === "\\" && index + 1 < source.length) {
          expression += character + source[index + 1]
          index += 1
          continue
        }
        expression += character
        continue
      }
      if (character === "'" || character === '"') {
        quote = character
        expression += character
        continue
      }
      if (source.slice(index, index + 2) === "}}") {
        expressions.push(expression)
        index += 1
        closed = true
        break
      }
      expression += character
    }
    if (!closed) {
      throw new Error(`expressão de Actions sem fechamento no offset ${start}`)
    }
  }
  return expressions
}

function scanActionExpression(expression, names) {
  const tokens = actionExpressionTokens(expression)
  const contexts = new Set(["secrets", "vars", "env"])
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (token.type !== "identifier" || !contexts.has(token.value)) continue
    const operator = tokens[index + 1]
    const key = tokens[index + 2]
    if (operator?.value === "." && key?.type === "identifier" && /^[A-Z][A-Z0-9_]*$/.test(key.value)) {
      names.add(key.value)
      index += 2
      continue
    }
    if (
      operator?.value === "[" &&
      key?.type === "string" &&
      /^[A-Z][A-Z0-9_]*$/.test(key.value) &&
      tokens[index + 3]?.value === "]"
    ) {
      names.add(key.value)
      index += 3
      continue
    }
    throw new Error(
      `acesso bare ou dinâmico de Actions sem resolução estática: ${expression.trim()}`,
    )
  }
}

export function scanWorkflowSource(source) {
  const names = new Set()
  for (const match of source.matchAll(/^\s{2,12}([A-Z][A-Z0-9_]*):\s*(?!$)/gm)) {
    names.add(match[1])
  }
  for (const expression of actionExpressions(source)) {
    scanActionExpression(expression, names)
  }
  for (const block of workflowRunBlocks(source)) {
    for (const name of scanShellSource(block)) names.add(name)
  }
  return names
}

function scanWorkflows(files) {
  const names = new Set()
  for (const file of files.filter((entry) => entry.startsWith(".github/") && /\.ya?ml$/.test(entry))) {
    const source = readFileSync(path.join(root, file), "utf8")
    for (const name of scanWorkflowSource(source)) names.add(name)
  }
  return names
}

function contractBlock() {
  const docs = readFileSync(path.join(root, "Settings/AUTOMATIONS_AND_ENVIRONMENTS.md"), "utf8")
  const match = docs.match(/<!-- env-contract:start -->([\s\S]*?)<!-- env-contract:end -->/)
  if (!match) throw new Error("bloco env-contract ausente na documentação")
  return match[1]
}

function recoveryRunbook() {
  return readFileSync(path.join(root, "docs/RUNBOOK-DR.md"), "utf8")
}

export function checkRunbookVercelInventory(documented, source = recoveryRunbook()) {
  const row = source.split(/\r?\n/).find((line) => line.startsWith("| Vercel, runtime |"))
  if (!row) throw new Error("inventário Vercel ausente em docs/RUNBOOK-DR.md")

  const keys = new Set([...row.matchAll(/`([A-Z][A-Z0-9_]*)`/g)].map((match) => match[1]))
  const required = ["PF_ALERTS_REPLY_TO_EMAIL"]
  const missing = required.filter((key) => !keys.has(key))
  const unknown = [...keys].filter((key) => !documented.has(key)).sort()
  if (missing.length || unknown.length) {
    throw new Error(
      [
        missing.length ? `runbook Vercel sem variável obrigatória: ${missing.join(", ")}` : "",
        unknown.length ? `runbook Vercel fora do contrato: ${unknown.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("; "),
    )
  }
}

function documentedKeys() {
  return new Set([...contractBlock().matchAll(/`([A-Z][A-Z0-9_]*)`/g)].map((match) => match[1]))
}

function exampleEntries() {
  const source = readFileSync(path.join(root, ".env.example"), "utf8")
  const entries = new Map()
  for (const [index, line] of source.split(/\r?\n/).entries()) {
    if (!line || line.trimStart().startsWith("#")) continue
    const match = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line)
    if (!match) throw new Error(`linha inválida em .env.example:${index + 1}`)
    if (entries.has(match[1])) throw new Error(`chave duplicada em .env.example: ${match[1]}`)
    entries.set(match[1], match[2])
  }
  return entries
}

function referenceKeys() {
  const files = trackedFiles()
  return new Set([
    ...scanJavaScript(files),
    ...scanPython(files),
    ...scanShell(files),
    ...scanWorkflows(files),
  ])
}

const safeNonEmptyExamples = new Map([
  ["SUPABASE_URL", "https://your-project.supabase.co"],
  ["NEXT_PUBLIC_SUPABASE_URL", "https://your-project.supabase.co"],
  ["NEXT_PUBLIC_SITE_URL", "http://localhost:3000"],
  ["NEXT_PUBLIC_X_HANDLE", "@puxaficha"],
  ["PF_BASE_URL", "http://127.0.0.1:3000"],
  ["PF_PUBLIC_SITE_URL", "https://puxaficha.com.br"],
  ["PF_PUBLIC_ORIGIN", "https://puxaficha.com.br"],
  ["NEXT_PUBLIC_ALERTS_EMAIL_ENABLED", "false"],
  ["SENTRY_ENABLE_PREVIEW", "0"],
  ["NEXT_PUBLIC_SENTRY_ENABLE_PREVIEW", "0"],
  ["SENTRY_TRACES_SAMPLE_RATE", "0.05"],
  ["NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE", "0.05"],
  ["PF_SUPABASE_FETCH_CONCURRENCY", "24"],
  ["PF_SUPABASE_FETCH_QUEUE_TIMEOUT_MS", "10000"],
  ["SUPABASE_ATTEMPT_TIMEOUT_MS", "15000"],
  ["PF_FORCE_PRODUCTION_SECURITY_HEADERS", "0"],
  ["PF_DRY_RUN", "1"],
  ["PF_TSE_INGEST_DRY_RUN", "1"],
  ["PF_TSE_INGEST_SKIP_PATRIMONIO", "0"],
  ["PF_KEEP_TSE_DOWNLOADS", "0"],
  ["PF_PLAYWRIGHT_EDITORIAL_WEBSERVER", "0"],
  ["PF_QUIZ_OG_BASE_URL", "http://127.0.0.1:3000"],
  ["PF_RUN_SEARCH_SMOKE", "0"],
])

function checkExample(references, documented) {
  const entries = exampleEntries()
  const unknown = [...entries.keys()].filter((key) => !references.has(key))
  const undocumented = [...entries.keys()].filter((key) => !documented.has(key))
  const unsafe = []
  for (const [key, value] of entries) {
    const expected = safeNonEmptyExamples.get(key) ?? ""
    if (value !== expected) unsafe.push(key)
  }
  if (unknown.length || undocumented.length || unsafe.length) {
    throw new Error(
      [
        unknown.length ? `sem uso real: ${unknown.join(", ")}` : "",
        undocumented.length ? `sem documentação: ${undocumented.join(", ")}` : "",
        unsafe.length ? `valor de exemplo não seguro ou inesperado: ${unsafe.join(", ")}` : "",
      ]
        .filter(Boolean)
        .join("; "),
    )
  }
  console.log(`PASS: exemplo seguro (${entries.size} chaves, nenhum segredo versionado)`)
}

export function checkDocs(references, documented, block = contractBlock()) {
  const missing = [...references].filter((key) => !documented.has(key)).sort()
  const stale = [...documented].filter((key) => !references.has(key)).sort()
  const requiredMarkers = [
    "Obrigatoriedade e fallback",
    "Responsável",
    "PF_ALERTS_REPLY_TO_EMAIL",
    "um único endereço simples",
    "sem fallback",
    "antes de qualquer chamada de rede",
  ]
  const missingMarkers = requiredMarkers.filter((marker) => !block.includes(marker))
  const staleMarkers = ["PF-24 ainda não está", "explicitamente pendente"]
  const presentStaleMarkers = staleMarkers.filter((marker) => block.includes(marker))
  if (missing.length || stale.length || missingMarkers.length || presentStaleMarkers.length) {
    throw new Error(
      [
        missing.length ? `referências sem documentação: ${missing.join(", ")}` : "",
        stale.length ? `documentação sem uso real: ${stale.join(", ")}` : "",
        missingMarkers.length ? `campos obrigatórios ausentes: ${missingMarkers.join(", ")}` : "",
        presentStaleMarkers.length
          ? `marcadores obsoletos ainda presentes: ${presentStaleMarkers.join(", ")}`
          : "",
      ]
        .filter(Boolean)
        .join("; "),
    )
  }
  checkRunbookVercelInventory(documented)
  console.log(`PASS: documentação alinhada (${documented.size} variáveis classificadas)`)
}

function main() {
  const mode = process.argv[2] ?? "all"
  if (!supportedModes.has(mode)) {
    console.error(`modo desconhecido: ${mode}`)
    process.exitCode = 2
    return
  }

  try {
    const references = referenceKeys()
    const documented = documentedKeys()
    if (mode === "--check-example") {
      checkExample(references, documented)
    } else if (mode === "--check-docs") {
      checkDocs(references, documented)
    } else {
      checkDocs(references, documented)
      checkExample(references, documented)
      console.log("PASS: 0 referências sem classificação")
    }
  } catch (error) {
    console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
