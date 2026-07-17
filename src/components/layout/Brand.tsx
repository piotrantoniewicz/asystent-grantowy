import Link from "next/link";

export default function Brand({ className = "" }: { className?: string }) {
  return (
    <Link
      href="https://dobryai.pl"
      target="_blank"
      rel="noopener noreferrer"
      className={`font-serif text-[17px] tracking-tight text-foreground ${className}`}
    >
      dobry<span className="text-primary-hover">ai</span>.pl
    </Link>
  );
}
