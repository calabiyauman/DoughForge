class TestElement {
  readonly children: TestElement[] = []
  readonly textContent: string | null = null

  constructor(
    readonly localName: string,
    private readonly attributes: ReadonlyMap<string, string>
  ) {}

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null
  }

  querySelector(selector: string): TestElement | null {
    for (const child of this.children) {
      if (child.localName === selector) return child
      const nested = child.querySelector(selector)
      if (nested) return nested
    }
    return null
  }
}

class TestDocument {
  constructor(readonly documentElement: TestElement) {}

  querySelector(selector: string): TestElement | null {
    return this.documentElement.localName === selector
      ? this.documentElement
      : this.documentElement.querySelector(selector)
  }
}

/**
 * Minimal XML DOM used only by Node regression tests. Production SVG import
 * continues to use the browser's standards-compliant DOMParser.
 */
export class TestDOMParser {
  parseFromString(source: string): Document {
    const stack: TestElement[] = []
    let root: TestElement | undefined
    const tagPattern = /<[^>]+>/g
    let match: RegExpExecArray | null

    while ((match = tagPattern.exec(source)) !== null) {
      const raw = match[0]
      if (raw.startsWith('<?') || raw.startsWith('<!')) continue
      if (raw.startsWith('</')) {
        stack.pop()
        continue
      }

      const selfClosing = /\/\s*>$/.test(raw)
      const body = raw.slice(1, selfClosing ? raw.lastIndexOf('/') : -1).trim()
      const nameMatch = /^([^\s/>]+)/.exec(body)
      if (!nameMatch) continue
      const localName = nameMatch[1].split(':').at(-1) || nameMatch[1]
      const attributes = new Map<string, string>()
      const attributePattern = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g
      let attributeMatch: RegExpExecArray | null
      const attributeSource = body.slice(nameMatch[0].length)
      while ((attributeMatch = attributePattern.exec(attributeSource)) !== null) {
        attributes.set(attributeMatch[1], attributeMatch[2] ?? attributeMatch[3] ?? '')
      }

      const element = new TestElement(localName, attributes)
      const parent = stack[stack.length - 1]
      if (parent) parent.children.push(element)
      else root = element
      if (!selfClosing) stack.push(element)
    }

    if (!root) throw new Error('Test XML did not contain a root element')
    return new TestDocument(root) as unknown as Document
  }
}

export function installTestDOMParser(): () => void {
  const domGlobal = globalThis as unknown as { DOMParser?: typeof DOMParser }
  const original = domGlobal.DOMParser
  domGlobal.DOMParser = TestDOMParser as unknown as typeof DOMParser
  return () => {
    if (original) domGlobal.DOMParser = original
    else delete domGlobal.DOMParser
  }
}
