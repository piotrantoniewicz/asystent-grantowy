import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function LegalContent({ markdown }: { markdown: string }) {
  return (
    <div className="space-y-4 text-sm leading-relaxed text-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="font-serif text-3xl font-normal text-foreground">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="mt-6 font-serif text-xl font-normal text-foreground">{children}</h2>
          ),
          p: ({ children }) => <p className="text-muted">{children}</p>,
          ul: ({ children }) => (
            <ul className="list-disc space-y-1 pl-5 text-muted">{children}</ul>
          ),
          li: ({ children }) => <li>{children}</li>,
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          a: ({ href, children }) => (
            <a href={href} className="text-primary-hover underline hover:no-underline">
              {children}
            </a>
          ),
          blockquote: ({ children }) => (
            <blockquote className="rounded border-l-4 border-primary-hover bg-primary-soft px-4 py-2 text-foreground">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-border px-2 py-1.5 font-semibold text-foreground">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-border px-2 py-1.5 align-top text-muted">
              {children}
            </td>
          ),
        }}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}
