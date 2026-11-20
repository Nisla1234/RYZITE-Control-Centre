import React, { useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Mail,
  MapPin,
  Phone,
} from 'lucide-react';
import type { PageBlock } from '../../types/cms';

function renderInlineMarkdown(text: string): React.ReactNode[] {
  if (!text) return [];
  const tokens = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g);
  return tokens.map((token, idx) => {
    if (token.startsWith('**') && token.endsWith('**')) {
      return (
        <strong key={idx} className="font-semibold text-[#0F172A]">
          {token.slice(2, -2)}
        </strong>
      );
    }
    if (token.startsWith('*') && token.endsWith('*')) {
      return (
        <em key={idx} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    }
    const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      const href = linkMatch[2];
      const safeHref = /^(https?:|\/|mailto:|tel:)/i.test(href) ? href : '#';
      return (
        <a
          key={idx}
          href={safeHref}
          className="text-[#1438B8] underline underline-offset-2 hover:text-[#0D1F4E]"
        >
          {linkMatch[1]}
        </a>
      );
    }
    return <React.Fragment key={idx}>{token}</React.Fragment>;
  });
}

function FaqSection({ block }: { block: PageBlock }) {
  const [openIdx, setOpenIdx] = useState<number | null>(0);
  const faqs = block.faqs || [];
  if (faqs.length === 0) return null;

  return (
    <section className="py-10">
      {block.text && (
        <h2 className="text-2xl font-bold text-[#0D1F4E] mb-6">{block.text}</h2>
      )}
      <div className="space-y-3">
        {faqs.map((item, idx) => {
          const isOpen = openIdx === idx;
          return (
            <div
              key={idx}
              className="rounded-xl border border-[#DDE5F0] bg-white overflow-hidden"
            >
              <button
                type="button"
                onClick={() => setOpenIdx(isOpen ? null : idx)}
                className="w-full px-5 py-4 text-left flex items-center justify-between gap-4 hover:bg-[#F8FAFD]"
              >
                <span className="text-sm font-semibold text-[#0F172A]">
                  {item.question}
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-[#64748B] transition-transform shrink-0 ${
                    isOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>
              {isOpen && (
                <div className="px-5 pb-4 text-sm text-[#475569] leading-relaxed border-t border-[#EDF2FA] pt-3">
                  {renderInlineMarkdown(item.answer)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function PageBlockRenderer({
  blocks,
  onNavigate,
}: {
  blocks: PageBlock[];
  onNavigate?: (url: string) => void;
}) {
  const visibleBlocks = (blocks || []).filter((b) => b.visible !== false);

  const handleLink = (e: React.MouseEvent, url?: string) => {
    if (!url) return;
    if (onNavigate && url.startsWith('/')) {
      e.preventDefault();
      onNavigate(url);
    }
  };

  return (
    <div className="space-y-8">
      {visibleBlocks.map((block) => {
        if (block.type === 'hero') {
          return (
            <section
              key={block.id}
              className="relative rounded-2xl bg-gradient-to-br from-[#0D1F4E] via-[#122D7A] to-[#1438B8] text-white overflow-hidden shadow-lg"
            >
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center p-8 sm:p-12">
                <div className={block.imageUrl ? 'lg:col-span-7 space-y-5' : 'lg:col-span-10 space-y-5'}>
                  {block.eyebrow && (
                    <p className="text-xs font-bold tracking-[0.18em] uppercase text-[#93C5FD]">
                      {block.eyebrow}
                    </p>
                  )}
                  <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight leading-[1.12]">
                    {block.text}
                  </h1>
                  {block.subtitle && (
                    <p className="text-base sm:text-lg text-[#DBEAFE] leading-relaxed max-w-2xl">
                      {block.subtitle}
                    </p>
                  )}
                  {(block.primaryButtonText || block.secondaryButtonText) && (
                    <div className="flex flex-wrap items-center gap-3 pt-2">
                      {block.primaryButtonText && (
                        <a
                          href={block.primaryButtonUrl || '/contact'}
                          onClick={(e) => handleLink(e, block.primaryButtonUrl)}
                          className="inline-flex items-center gap-2 rounded-lg bg-white text-[#0D1F4E] hover:bg-[#EFF6FF] px-5 py-3 text-sm font-semibold shadow-sm transition-colors"
                        >
                          {block.primaryButtonText}
                          <ArrowRight className="w-4 h-4" />
                        </a>
                      )}
                      {block.secondaryButtonText && (
                        <a
                          href={block.secondaryButtonUrl || '/about'}
                          onClick={(e) => handleLink(e, block.secondaryButtonUrl)}
                          className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/10 hover:bg-white/20 text-white px-5 py-3 text-sm font-semibold transition-colors"
                        >
                          {block.secondaryButtonText}
                        </a>
                      )}
                    </div>
                  )}
                </div>
                {block.imageUrl && (
                  <div className="lg:col-span-5">
                    <img
                      src={block.imageUrl}
                      alt={block.imageAlt || block.text || 'Hero visual'}
                      className="w-full h-64 sm:h-72 object-cover rounded-xl border border-white/15 shadow-xl"
                    />
                  </div>
                )}
              </div>
            </section>
          );
        }

        if (block.type === 'heading') {
          const Tag = block.level === 1 ? 'h1' : block.level === 3 ? 'h3' : 'h2';
          const cls =
            block.level === 1
              ? 'text-3xl sm:text-4xl font-bold tracking-tight text-[#0D1F4E]'
              : block.level === 3
                ? 'text-lg font-bold text-[#0F172A]'
                : 'text-2xl sm:text-3xl font-bold tracking-tight text-[#0D1F4E]';
          return (
            <Tag key={block.id} className={cls}>
              {block.text}
            </Tag>
          );
        }

        if (block.type === 'paragraph') {
          return (
            <p key={block.id} className="text-base text-[#334155] leading-relaxed max-w-3xl">
              {renderInlineMarkdown(block.text || '')}
            </p>
          );
        }

        if (block.type === 'list') {
          return (
            <ul key={block.id} className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(block.items || []).filter(Boolean).map((item, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2.5 rounded-xl border border-[#E5ECF6] bg-white px-4 py-3 text-sm text-[#1E293B]"
                >
                  <CheckCircle2 className="w-4 h-4 text-[#1438B8] shrink-0 mt-0.5" />
                  <span>{renderInlineMarkdown(item)}</span>
                </li>
              ))}
            </ul>
          );
        }

        if (block.type === 'image') {
          if (!block.imageUrl) return null;
          return (
            <figure key={block.id} className="space-y-2">
              <div className="rounded-2xl overflow-hidden border border-[#DDE5F0] bg-[#F8FAFD]">
                <img
                  src={block.imageUrl}
                  alt={block.imageAlt || ''}
                  className="w-full max-h-[460px] object-cover"
                />
              </div>
              {block.caption && (
                <figcaption className="text-xs text-[#64748B] text-center">
                  {block.caption}
                </figcaption>
              )}
            </figure>
          );
        }

        if (block.type === 'stats') {
          return (
            <section key={block.id} className="space-y-4">
              {block.text && (
                <h2 className="text-xl font-bold text-[#0D1F4E]">{block.text}</h2>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {(block.stats || []).map((st, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-[#DDE5F0] bg-white p-5 shadow-xs"
                  >
                    <p className="text-3xl font-bold text-[#1438B8]">{st.value}</p>
                    <p className="text-sm font-semibold text-[#0F172A] mt-1">{st.label}</p>
                    {st.note && <p className="text-xs text-[#64748B] mt-0.5">{st.note}</p>}
                  </div>
                ))}
              </div>
            </section>
          );
        }

        if (block.type === 'cards') {
          return (
            <section key={block.id} className="space-y-4">
              {block.text && (
                <h2 className="text-2xl font-bold text-[#0D1F4E]">{block.text}</h2>
              )}
              {block.subtitle && (
                <p className="text-sm text-[#475569] max-w-2xl">{block.subtitle}</p>
              )}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {(block.cards || []).map((card, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl border border-[#DDE5F0] bg-white overflow-hidden flex flex-col hover:border-[#1438B8]/40 hover:shadow-md transition-all"
                  >
                    {card.imageUrl && (
                      <img
                        src={card.imageUrl}
                        alt={card.title}
                        className="w-full h-40 object-cover"
                      />
                    )}
                    <div className="p-5 flex-1 flex flex-col justify-between gap-3">
                      <div>
                        <h3 className="text-base font-bold text-[#0F172A]">{card.title}</h3>
                        <p className="text-sm text-[#475569] mt-1.5 leading-relaxed">
                          {card.description}
                        </p>
                      </div>
                      {card.linkUrl && (
                        <a
                          href={card.linkUrl}
                          onClick={(e) => handleLink(e, card.linkUrl)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-[#1438B8] hover:text-[#0D1F4E]"
                        >
                          {card.linkText || 'Learn more'} <ArrowRight className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        }

        if (block.type === 'faq') {
          return <FaqSection key={block.id} block={block} />;
        }

        if (block.type === 'contact') {
          return (
            <section
              key={block.id}
              className="rounded-2xl border border-[#DDE5F0] bg-white p-6 sm:p-8 grid grid-cols-1 md:grid-cols-3 gap-6"
            >
              <div className="md:col-span-3">
                <h2 className="text-xl font-bold text-[#0D1F4E]">
                  {block.text || 'Get in Touch with RYZITE'}
                </h2>
                {block.subtitle && (
                  <p className="text-sm text-[#475569] mt-1">{block.subtitle}</p>
                )}
              </div>
              {block.contactEmail && (
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[#EEF3FC] text-[#1438B8] flex items-center justify-center shrink-0">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[#64748B]">Email</p>
                    <a
                      href={`mailto:${block.contactEmail}`}
                      className="text-sm font-semibold text-[#0F172A] hover:text-[#1438B8]"
                    >
                      {block.contactEmail}
                    </a>
                  </div>
                </div>
              )}
              {block.contactPhone && (
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[#EEF3FC] text-[#1438B8] flex items-center justify-center shrink-0">
                    <Phone className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[#64748B]">Phone</p>
                    <p className="text-sm font-semibold text-[#0F172A]">{block.contactPhone}</p>
                  </div>
                </div>
              )}
              {block.contactAddress && (
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[#EEF3FC] text-[#1438B8] flex items-center justify-center shrink-0">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-[#64748B]">Office</p>
                    <p className="text-sm font-semibold text-[#0F172A]">{block.contactAddress}</p>
                  </div>
                </div>
              )}
            </section>
          );
        }

        if (block.type === 'cta') {
          return (
            <section
              key={block.id}
              className="rounded-2xl bg-[#0D1F4E] text-white p-8 sm:p-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6"
            >
              <div className="space-y-2 max-w-2xl">
                <h2 className="text-2xl font-bold">{block.ctaHeading}</h2>
                {block.ctaBody && <p className="text-sm text-[#CBD5E1]">{block.ctaBody}</p>}
              </div>
              {block.ctaButtonText && (
                <a
                  href={block.ctaButtonUrl || '/contact'}
                  onClick={(e) => handleLink(e, block.ctaButtonUrl)}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-white text-[#0D1F4E] hover:bg-[#EFF6FF] px-5 py-3 text-sm font-semibold shrink-0 transition-colors"
                >
                  {block.ctaButtonText}
                  <ArrowRight className="w-4 h-4" />
                </a>
              )}
            </section>
          );
        }

        return null;
      })}
    </div>
  );
}
