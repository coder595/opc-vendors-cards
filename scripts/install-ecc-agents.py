#!/usr/bin/env python3
"""Install curated ECC agents as opencode subagents.

Converts ECC's canonical agent definitions (Claude Code format) into opencode
markdown agents under `.opencode/agent/`. Run from the repo root:

    python3 scripts/install-ecc-agents.py

Requires ECC to be installed at ~/.claude/plugins/marketplaces/ecc.
Generated agents are committed, so colleagues do not need ECC to use them.
"""
import os
import re
import sys

ECC = os.path.expanduser("~/.claude/plugins/marketplaces/ecc")
AGENT_SRC = os.path.join(ECC, "agents")
OC_PROMPTS = os.path.join(ECC, ".opencode", "prompts", "agents")
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".opencode", "agent")

# name -> edit permission (True = may modify files)
AGENTS = {
    "planner": False,
    "architect": False,
    "code-reviewer": False,
    "typescript-reviewer": False,
    "react-reviewer": False,
    "security-reviewer": False,
    "a11y-architect": False,
    "performance-optimizer": False,
    "type-design-analyzer": False,
    "silent-failure-hunter": False,
    "docs-lookup": False,
    "tdd-guide": True,
    "e2e-runner": True,
    "code-simplifier": True,
    "refactor-cleaner": True,
    "react-build-resolver": True,
    "doc-updater": True,
}

FM_RE = re.compile(r"^---\n(.*?)\n---\n?", re.DOTALL)


def parse_frontmatter(text):
    m = FM_RE.match(text)
    if not m:
        return {}, text
    fm = {}
    for line in m.group(1).splitlines():
        if ":" in line and not line.startswith((" ", "\t")):
            k, v = line.split(":", 1)
            fm[k.strip()] = v.strip()
    return fm, text[m.end():].strip()


def yaml_quote(s):
    return '"' + s.replace("\\", "\\\\").replace('"', '\\"') + '"'


def main():
    if not os.path.isdir(AGENT_SRC):
        sys.exit(f"ECC agents not found at {AGENT_SRC}. Install ECC first.")
    os.makedirs(OUT, exist_ok=True)
    written = []
    for name, edit in AGENTS.items():
        src_md = os.path.join(AGENT_SRC, name + ".md")
        if not os.path.isfile(src_md):
            print("MISSING source:", src_md)
            continue
        with open(src_md, encoding="utf-8") as f:
            fm, body = parse_frontmatter(f.read())

        oc_txt = os.path.join(OC_PROMPTS, name + ".txt")
        if os.path.isfile(oc_txt):
            with open(oc_txt, encoding="utf-8") as f:
                body = f.read().strip()

        desc = fm.get("description", name).replace("\n", " ").strip()
        header = "\n".join([
            "---",
            f"description: {yaml_quote(desc)}",
            "mode: subagent",
            "permission:",
            f"  edit: {'allow' if edit else 'deny'}",
            "  bash: allow",
            "---",
            "",
        ])
        with open(os.path.join(OUT, name + ".md"), "w", encoding="utf-8") as f:
            f.write(header + body + "\n")
        written.append(name)

    print(f"Wrote {len(written)} agents to {OUT}:")
    for n in written:
        print("  -", n)


if __name__ == "__main__":
    main()
