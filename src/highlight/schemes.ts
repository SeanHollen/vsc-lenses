export interface Scheme {
  id: string;
  name: string;
  question: string; // the one question this lens answers
  description: string;
  example: string;
  /** Lines changed vs. base, for the git example. */
  exampleChanged?: number[];
}

export const SCHEMES: Scheme[] = [
  {
    id: 'none',
    name: 'Ordinary syntax',
    question: 'What part of speech is this?',
    description: 'Default VS Code coloring: keywords, strings and numbers. No lens.',
    example: `function total(items, tax) {\n  const sum = items.reduce((a, b) => a + b, 0);\n  return sum * (1 + tax);\n}`,
  },
  {
    id: 'rainbow',
    name: 'Rainbow brackets',
    question: 'Which bracket closes which?',
    description: 'Brackets are colored by nesting depth, so a dense expression shows its structure at a glance.',
    example: `const r = f(g([a, h({ k: (x + y) * z })]));`,
  },
  {
    id: 'context',
    name: 'Nesting context',
    question: 'How deep am I?',
    description: 'Lines are shaded by how many blocks enclose them. Deeply nested logic stands out as dark wedges.',
    example: `function walk(tree) {\n  for (const node of tree) {\n    if (node.children) {\n      walk(node.children);\n    }\n  }\n}`,
  },
  {
    id: 'imports',
    name: 'Imports by source',
    question: 'Where did this name come from?',
    description: 'Every imported identifier is colored by its module. The legend lists the modules in the current file.',
    example: `import { debounce } from 'lodash';\nimport { fetchUser } from './api';\n\nconst load = debounce(\n  (id) => fetchUser(id), 200);`,
  },
  {
    id: 'arguments',
    name: 'Argument flow',
    question: 'Does this come from the caller?',
    description: 'Arguments, values computed from them, other locals and module-level names each get their own color.',
    example: `const RATE = 0.2;\nfunction price(base, qty) {\n  const gross = base * qty;\n  let fee = 5;\n  return gross * RATE + fee;\n}`,
  },
  {
    id: 'types',
    name: 'Types',
    question: 'What kind of value is this?',
    description: 'Identifiers are colored by inferred type: numbers, strings, arrays, functions, promises. Unions are flagged, and a dotted underline means it may be null or undefined.',
    example: `const ids = [1, 2, 3];\nconst user = 'ada';\nconst n = ids.length;\nconst first = ids.find(i => i > n);\nconst p = fetch(user);`,
  },
  {
    id: 'exceptions',
    name: 'Exceptions',
    question: 'Can this blow up?',
    description: 'Functions that can throw (directly or through what they call) are red. Unguarded calls get a wavy underline; calls inside try/catch are green.',
    example: `function parse(s) {\n  if (!s) throw new Error('empty');\n  return JSON.parse(s);\n}\nconst a = parse(input);\ntry { parse(other); } catch {}`,
  },
  {
    id: 'git',
    name: 'Changed on branch',
    question: 'What did this branch touch?',
    description: 'Functions whose bodies differ from the base branch (main/master, or HEAD) are highlighted, along with every call to them.',
    example: `function load(id) {\n  return cache.get(id) ?? fetchIt(id);\n}\nfunction show(id) {\n  render(load(id));\n}`,
    exampleChanged: [1],
  },
];

export const schemeById = (id: string) => SCHEMES.find(s => s.id === id);
