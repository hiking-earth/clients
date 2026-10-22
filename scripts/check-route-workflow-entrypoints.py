#!/usr/bin/env python3
"""Fail before collection if workflow Python entrypoints/imports are missing."""
import ast
from pathlib import Path
import importlib.util
import re
import sys
import textwrap


ROOT = Path(__file__).resolve().parents[1]
WORKFLOW = ROOT / '.github/workflows/route-catalog-update.yml'
SCRIPT_COMMAND = re.compile(
    r'(?m)^\s*(?:run:\s*)?python3?\s+'
    r'(?P<path>scripts/[A-Za-z0-9_./-]+\.py)(?=\s|$)'
)
INLINE_PYTHON = re.compile(
    r"(?m)^\s*python3?\s+-\s+<<(?P<quote>['\"]?)(?P<tag>[A-Za-z_][A-Za-z0-9_]*)\1\s*$"
)


def inline_python_sources(text):
    lines = text.splitlines()
    for index, line in enumerate(lines):
        match = INLINE_PYTHON.match(line)
        if not match:
            continue
        tag = match.group('tag')
        body = []
        for end in range(index + 1, len(lines)):
            if re.fullmatch(rf"\s*{re.escape(tag)}\s*", lines[end]):
                yield tag, textwrap.dedent('\n'.join(body))
                break
            body.append(lines[end])
        else:
            yield tag, ''


def main():
    try:
        text = WORKFLOW.read_text(encoding='utf-8')
    except OSError as error:
        print(f'Cannot read route workflow: {error}', file=sys.stderr)
        return 1

    scripts = sorted(set(SCRIPT_COMMAND.findall(text)))
    if not scripts:
        print('No repository Python entrypoints were found in route workflow.', file=sys.stderr)
        return 1

    sys.path.insert(0, str(ROOT))
    missing = []
    missing_imports = []
    parsed = set()

    def source_for(module):
        parts = module.split('.')
        for base in (ROOT / 'scripts', ROOT):
            candidate = base.joinpath(*parts).with_suffix('.py')
            package = base.joinpath(*parts, '__init__.py')
            if candidate.is_file():
                return candidate
            if package.is_file():
                return package
        return None

    def inspect_source(label, source, identity=None):
        if identity is not None:
            identity = identity.resolve()
            if identity in parsed:
                return
            parsed.add(identity)
        try:
            tree = ast.parse(source, filename=label)
        except SyntaxError as error:
            missing_imports.append((label, f'cannot parse: {error}'))
            return

        modules = set()
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                modules.update(alias.name for alias in node.names)
            elif isinstance(node, ast.ImportFrom) and node.module:
                modules.add(node.module)
        for module in sorted(modules):
            local = source_for(module)
            if local is not None:
                inspect_imports(local)
                continue
            top_level = module.split('.', 1)[0]
            if top_level in sys.stdlib_module_names:
                continue
            try:
                available = importlib.util.find_spec(module) is not None
            except (ImportError, ModuleNotFoundError, ValueError):
                available = False
            if not available:
                missing_imports.append((label, module))

    def inspect_imports(script):
        script = script.resolve()
        if script in parsed:
            return
        try:
            label = str(script.relative_to(ROOT.resolve()))
        except ValueError:
            missing_imports.append((str(script), 'local import resolves outside repository'))
            return
        try:
            source = script.read_text(encoding='utf-8')
        except OSError as error:
            missing_imports.append((label, f'cannot parse: {error}'))
            return
        inspect_source(label, source, identity=script)

    for value in scripts:
        path = Path(value)
        resolved = (ROOT / path).resolve()
        if (path.is_absolute() or '..' in path.parts
                or not resolved.is_relative_to(ROOT.resolve()) or not resolved.is_file()):
            missing.append(value)
            continue
        inspect_imports(resolved)

    workflow_label = str(WORKFLOW.relative_to(ROOT))
    for tag, source in inline_python_sources(text):
        inspect_source(f'{workflow_label} inline Python heredoc {tag}', source)

    if missing:
        print('Route workflow references missing or unsafe scripts:', file=sys.stderr)
        for value in missing:
            print(f'- {value}', file=sys.stderr)
    if missing_imports:
        print('Route workflow scripts have missing imports or unreadable local dependencies:', file=sys.stderr)
        for source, module in sorted(set(missing_imports)):
            print(f'- {source}: {module}', file=sys.stderr)
    if missing or missing_imports:
        return 1

    print(f'Verified {len(scripts)} route workflow entrypoints, inline Python blocks, and static imports.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
