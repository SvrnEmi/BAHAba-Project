import { Fragment, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft } from "lucide-react";
// Single source of truth: the Markdown files at the repo root.
import termsMarkdown from "../../../terms_of_service.md?raw";
import privacyMarkdown from "../../../privacy_policy.md?raw";

/*
 * Public /terms and /privacy pages (no account needed). Renders the small
 * Markdown subset the documents use: #/##/### headings, "- " lists, tables,
 * "---" rules, **bold** and *italic*. Lines inside a paragraph keep their
 * line breaks (e.g. the contact block).
 */

type Block =
  | { kind: "heading"; level: 1 | 2 | 3; text: string }
  | { kind: "rule" }
  | { kind: "list"; items: string[] }
  | { kind: "table"; header: string[]; rows: string[][] }
  | { kind: "paragraph"; lines: string[] };

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((c) => c.trim());

function parse(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length as 1 | 2 | 3, text: heading[2].trim() });
      i++;
    } else if (/^-{3,}\s*$/.test(line)) {
      blocks.push({ kind: "rule" });
      i++;
    } else if (/^\s*-\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*-\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*-\s+/, ""));
      blocks.push({ kind: "list", items });
    } else if (line.trim().startsWith("|")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        const row = cells(lines[i++]);
        if (!row.every((c) => /^:?-{3,}:?$/.test(c))) rows.push(row); // skip the |---| separator
      }
      blocks.push({ kind: "table", header: rows[0] ?? [], rows: rows.slice(1) });
    } else {
      const para: string[] = [];
      while (
        i < lines.length &&
        lines[i].trim() &&
        !/^(#{1,3}\s|-{3,}\s*$|\s*-\s+|\s*\|)/.test(lines[i])
      ) {
        para.push(lines[i++].trim());
      }
      blocks.push({ kind: "paragraph", lines: para });
    }
  }
  return blocks;
}

/** **bold** and *italic*; everything else is plain text (React escapes it). */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(m[1] !== undefined ? <strong key={m.index}>{m[1]}</strong> : <em key={m.index}>{m[2]}</em>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

const DOCS = {
  terms: { markdown: termsMarkdown, title: "Terms of Service" },
  privacy: { markdown: privacyMarkdown, title: "Privacy Policy" },
} as const;

export function LegalPage({ doc }: { doc: keyof typeof DOCS }) {
  const navigate = useNavigate();
  const blocks = parse(DOCS[doc].markdown);
  const ink = { color: "var(--text-primary)" };

  return (
    <div className="min-h-screen bg-background px-[18px] pt-4 pb-12">
      <div className="mx-auto max-w-3xl">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate("/login"))}
          aria-label="Back"
          className="clay clay-press mb-4 flex h-11 w-11 items-center justify-center rounded-full"
          style={{ color: "var(--primary-brand)" }}
        >
          <ArrowLeft size={20} aria-hidden="true" />
        </button>

        <article className="clay space-y-4 p-6 sm:p-8" style={{ borderRadius: 28, ...ink }} aria-label={DOCS[doc].title}>
          {blocks.map((block, index) => {
            switch (block.kind) {
              case "heading":
                return block.level === 1 ? (
                  <h1 key={index} className="text-2xl font-bold">{inline(block.text)}</h1>
                ) : block.level === 2 ? (
                  <h2 key={index} className="pt-3 text-lg font-bold">{inline(block.text)}</h2>
                ) : (
                  <h3 key={index} className="pt-2 text-base font-bold">{inline(block.text)}</h3>
                );
              case "rule":
                return <hr key={index} style={{ borderColor: "var(--border)" }} />;
              case "list":
                return (
                  <ul key={index} className="list-disc space-y-1.5 pl-6 text-[15px] leading-relaxed">
                    {block.items.map((item, j) => (
                      <li key={j}>{inline(item)}</li>
                    ))}
                  </ul>
                );
              case "table":
                return (
                  <div key={index} className="overflow-x-auto rounded-2xl border bg-white" style={{ borderColor: "var(--border)" }}>
                    <table className="w-full min-w-[560px] text-left text-sm leading-relaxed">
                      <thead>
                        <tr className="border-b" style={{ borderColor: "var(--border)" }}>
                          {block.header.map((h, j) => (
                            <th key={j} scope="col" className="px-4 py-3 font-semibold">{inline(h)}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {block.rows.map((row, j) => (
                          <tr key={j} className="border-b last:border-0 align-top" style={{ borderColor: "var(--border)" }}>
                            {row.map((c, k) => (
                              <td key={k} className="px-4 py-3">{inline(c)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              case "paragraph":
                return (
                  <p key={index} className="text-[15px] leading-relaxed">
                    {block.lines.map((l, j) => (
                      <Fragment key={j}>
                        {j > 0 && <br />}
                        {inline(l)}
                      </Fragment>
                    ))}
                  </p>
                );
            }
          })}
        </article>
      </div>
    </div>
  );
}
