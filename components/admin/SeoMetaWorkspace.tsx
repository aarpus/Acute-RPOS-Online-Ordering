'use client';
import { getNoticeTone } from '../../lib/notices';
import { useLegacyCollection, useLegacyDraft, useLegacyMenu } from './legacy-menu-client';
import { blankLegacy, legacyRows, type LegacyRow } from '../../lib/menu-legacy-codec';

import { useRef, useState, type FormEvent } from 'react';
import { Icon, MenuNavigation, Toggle } from './MenuControls';
import { seoPreviewUrl } from '../../lib/admin-seo';

type SeoPage = { id: number; page: string; slug: string; title: string; description: string; keywords: string; canonical: string; image: string; active: boolean };
const samplePages: [string, string, string][] = [
  ['Home', '/', 'Best Food Online Ordering | AcutePOS'],
  ['Menu', '/menu', 'Delicious Food Menu | AcutePOS'],
  ['Category – Biryani', '/menu/biryani', 'Biryani – Authentic Flavors | AcutePOS'],
  ['Category – Dinner', '/menu/dinner', 'Dinner Menu – Tasty Meals | AcutePOS'],
  ['Category – Combos', '/menu/combos', 'Combo Meals – Great Value | AcutePOS'],
  ['Item – Chicken Biryani', '/item/chicken-biryani', 'Chicken Biryani – Order Online | AcutePOS'],
  ['Offers', '/offers', 'Latest Food Offers | AcutePOS'],
  ['About Us', '/about', 'About AcutePOS | Our Story'],
  ['Contact Us', '/contact', 'Contact AcutePOS | Get in Touch'],
  ['Privacy Policy', '/privacy-policy', 'Privacy Policy – AcutePOS'],
  ['Terms & Conditions', '/terms', 'Terms & Conditions – AcutePOS'],
  ['FAQ', '/faq', 'Frequently Asked Questions | AcutePOS'],
];
const sampleinitialPages: SeoPage[] = samplePages.map(([page, slug, title], index) => ({ id: index + 1, page, slug, title, description: index === 0 ? 'Order your favorite food online with AcutePOS. Fresh, delicious and fast delivery. Explore our menu, special offers and combos.' : `Explore ${page.toLowerCase()} at AcutePOS. Discover fresh food, authentic flavors and convenient online ordering.`, keywords: index === 0 ? 'food, online ordering, restaurant, biryani, dinner, combos, AcutePOS' : `${page.toLowerCase()}, restaurant, online ordering, AcutePOS`, canonical: `https://acutepos.com${slug}`, image: '/images/biryani.jpg', active: index !== 11 }));

function Globe() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18M5 7h14M5 17h14" /></svg>; }

export default function SeoMetaWorkspace({ hidden = false, onNavigate }: { hidden?: boolean; onNavigate: (section: string) => void }) {
  const menu = useLegacyMenu(); const canCreate = menu.canCreate('seo-meta');
  const initialPages = [blankLegacy('seo-meta', sampleinitialPages[0] as unknown as LegacyRow, menu.snapshot) as unknown as SeoPage];

  const [pages, setPages] = useLegacyCollection<SeoPage>('seo-meta'); const [draft, setDraft] = useLegacyDraft<SeoPage>('seo-meta', initialPages[0]);
  const [query, setQuery] = useState(''); const [filterOpen, setFilterOpen] = useState(false); const [status, setStatus] = useState('All Status');
  const [page, setPage] = useState(1); const [pageSize, setPageSize] = useState(12); const [localNotice, setNotice] = useState(''); const notice = menu.error || (menu.loading ? 'Loading menu…' : localNotice);
  const [previewTab, setPreviewTab] = useState('Google Search'); const [platform, setPlatform] = useState('Facebook');
  const uploadRef = useRef<HTMLInputElement>(null); const titleRef = useRef<HTMLInputElement>(null);
  const update = <K extends keyof SeoPage>(key: K, value: SeoPage[K]) => setDraft(previous => ({ ...previous, [key]: value }));
  const filtered = pages.filter(item => `${item.page} ${item.slug} ${item.title}`.toLowerCase().includes(query.trim().toLowerCase()) && (status === 'All Status' || item.active === (status === 'Active')));
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize)); const currentPage = Math.min(page, totalPages); const rows = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const previewUrl = seoPreviewUrl(draft.canonical, draft.slug) || seoPreviewUrl('', draft.slug)!;
  function edit(item: SeoPage) { setDraft({ ...item }); setNotice(''); }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft.title.trim() || !draft.description.trim()) { setNotice('Please enter a meta title and meta description.'); titleRef.current?.focus(); return; }
    if (draft.title.length > 60 || draft.description.length > 160 || draft.keywords.length > 200) { setNotice('Keep the title within 60 characters, description within 160, and keywords within 200.'); return; }
    if (draft.canonical.trim() && (!/^https?:\/\//i.test(draft.canonical.trim()) || !seoPreviewUrl(draft.canonical, draft.slug))) { setNotice('Enter a valid canonical URL starting with https:// or http://.'); return; }
    const saved = { ...draft, title: draft.title.trim(), description: draft.description.trim(), keywords: draft.keywords.trim(), canonical: draft.canonical.trim() };
    if (!await setPages(previous => previous.map(item => item.id === saved.id ? saved : item))) return; setDraft(saved); setNotice('SEO & Meta saved. Saved to the database.');
  }
  function upload(file?: File) {
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size > 2 * 1024 * 1024) { setNotice('Choose a JPG or PNG image smaller than 2 MB.'); return; }
    const targetId = draft.id; const reader = new FileReader(); reader.onload = () => setDraft(previous => previous.id === targetId ? { ...previous, image: String(reader.result) } : previous); reader.onerror = () => setNotice('This image could not be read. Please try another file.'); reader.readAsDataURL(file);
  }

  return <div className="mw-workspace seo-workspace" hidden={hidden}>
    <div className="mw-page-heading"><div><h1>SEO &amp; Meta Management</h1><p>Manage page titles, meta descriptions, keywords and social media settings for better search visibility.</p></div></div>
    <MenuNavigation active="SEO & Meta" onChange={onNavigate} />
    {notice && <div className="mw-notice" data-notice-tone={menu.loading ? 'info' : getNoticeTone(notice, !!menu.error)} role={menu.error ? 'alert' : 'status'}>{notice}<button aria-label="Dismiss SEO notification" onClick={() => { setNotice(''); menu.clearError(); }}>×</button></div>}
    <div className="mw-columns seo-columns"><section className="mw-panel seo-list" aria-labelledby="seo-pages-heading"><h2 id="seo-pages-heading">Pages ({pages.length})</h2>
      <div className="mw-search-row"><div className="mw-search"><Icon name="search" size={20} /><input aria-label="Search SEO pages" placeholder="Search pages..." value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></div><button className={`mw-icon-button ${filterOpen ? 'is-active' : ''}`} aria-label="Filter SEO pages" aria-expanded={filterOpen} aria-controls="seo-page-filters" onClick={() => setFilterOpen(!filterOpen)}><Icon name="filter" size={20} /></button></div>
      {filterOpen && <div className="seo-filters" id="seo-page-filters"><select aria-label="Filter SEO page status" value={status} onChange={event => { setStatus(event.target.value); setPage(1); }}><option>All Status</option><option>Active</option><option>Inactive</option></select><button type="button" onClick={() => { setQuery(''); setStatus('All Status'); setPage(1); }}>Clear filters</button></div>}
      <div className="mw-table-scroll"><table className="mw-table seo-table"><thead><tr>{['#', 'Page', 'Slug/URL', 'Title', 'Status', 'Actions'].map(heading => <th key={heading} scope="col">{heading}</th>)}</tr></thead><tbody>{rows.map((item, index) => <tr key={item.id}><td>{(currentPage - 1) * pageSize + index + 1}</td><td><button className="mw-name" onClick={() => edit(item)}>{item.page}</button></td><td className="seo-truncated" title={item.slug}>{item.slug}</td><td className="seo-truncated" title={item.title}>{item.title}</td><td><span className={`seo-status ${item.active ? 'is-active' : ''}`}>{item.active ? 'Active' : 'Inactive'}</span></td><td><button className="seo-edit" aria-label={`Edit ${item.page} SEO`} onClick={() => edit(item)}><Icon name="edit" size={18} /></button></td></tr>)}</tbody></table>{!rows.length && <div className="mw-empty">No pages match your search and filters.</div>}</div>
      <div className="mw-pagination seo-pagination"><span>Showing {filtered.length ? (currentPage - 1) * pageSize + 1 : 0}–{Math.min(currentPage * pageSize, filtered.length)} of {filtered.length} pages</span><div><button aria-label="Previous SEO pages" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>‹</button>{Array.from({ length: totalPages }, (_, index) => index + 1).map(number => <button key={number} aria-label={`SEO pages ${number}`} aria-current={number === currentPage ? 'page' : undefined} className={number === currentPage ? 'is-active' : ''} onClick={() => setPage(number)}>{number}</button>)}<button aria-label="Next SEO pages" disabled={currentPage === totalPages} onClick={() => setPage(currentPage + 1)}>›</button><select aria-label="SEO pages per page" value={pageSize} onChange={event => { setPageSize(Number(event.target.value)); setPage(1); }}><option value={12}>12 / page</option><option value={10}>10 / page</option><option value={5}>5 / page</option><option value={25}>25 / page</option></select></div></div>
    </section><section className="mw-panel seo-editor" style={{ display: canCreate || (draft as unknown as { _dbId?: string })._dbId ? undefined : 'none' }} aria-labelledby="seo-editor-heading"><h2 id="seo-editor-heading">Edit SEO &amp; Meta</h2>
      <div className="seo-editor-content"><form className="seo-form" id="seo-meta-form" onSubmit={save} noValidate>
        <label className="mw-field"><span>Page <b>*</b></span><select aria-label="Page to edit metadata" value={draft.id} onChange={event => { const item = pages.find(value => value.id === Number(event.target.value)); if (item) edit(item); }}>{pages.map(item => <option key={item.id} value={item.id}>{item.page}</option>)}</select></label>
        <label className="mw-field"><span className="seo-label-row"><span>Meta Title <b>*</b></span><small>{draft.title.length}/60</small></span><input ref={titleRef} maxLength={60} value={draft.title} onChange={event => update('title', event.target.value)} /></label>
        <label className="mw-field"><span className="seo-label-row"><span>Meta Description <b>*</b></span><small>{draft.description.length}/160</small></span><textarea className="seo-description" maxLength={160} value={draft.description} onChange={event => update('description', event.target.value)} /></label>
        <label className="mw-field"><span className="seo-label-row"><span>Meta Keywords</span><small>{draft.keywords.length}/200</small></span><textarea className="seo-keywords" maxLength={200} value={draft.keywords} onChange={event => update('keywords', event.target.value)} /></label>
        <label className="mw-field"><span>Canonical URL</span><input type="url" placeholder={`https://acutepos.com${draft.slug}`} value={draft.canonical} onChange={event => update('canonical', event.target.value)} /></label>
        <div className="seo-image-field"><span>Open Graph Image</span><div><img src={draft.image} alt={`Open Graph image for ${draft.page}`} /><div><button className="mw-button mw-outline" type="button" onClick={() => uploadRef.current?.click()}><span className="seo-upload-icon"><Icon name="upload" size={16} /></span>Upload Image</button><small>Recommended size: 1200 × 630 px<br />Supported: JPG, PNG (Max 2MB)</small></div></div><input ref={uploadRef} hidden type="file" accept="image/jpeg,image/png" onChange={event => { upload(event.target.files?.[0]); event.target.value = ''; }} /></div>
        <div className="seo-status-field"><span>Status</span><div><Toggle checked={draft.active} label="SEO page active" onChange={() => update('active', !draft.active)} /><span>Active</span></div></div>
      </form><section className="seo-preview" aria-labelledby="seo-preview-heading"><h3 id="seo-preview-heading">Preview</h3><div className="seo-preview-tabs" role="tablist" aria-label="SEO preview mode">{['Google Search', 'Social Media'].map((value, index) => <button type="button" role="tab" key={value} id={`seo-preview-tab-${index}`} aria-controls="seo-preview-content" aria-selected={previewTab === value} className={previewTab === value ? 'is-active' : ''} onClick={() => setPreviewTab(value)}>{value}</button>)}</div><div className="seo-preview-content" id="seo-preview-content" role="tabpanel" aria-labelledby={`seo-preview-tab-${previewTab === 'Google Search' ? 0 : 1}`}>
        {previewTab === 'Google Search' && <section className="seo-google-card" aria-label="Google search result preview"><h4>Google Preview</h4><div className="seo-search-url"><Globe /><span>{previewUrl.url}</span></div><h3>{draft.title || 'Your page title'}</h3><p>{draft.description || 'Your meta description will appear here.'}</p></section>}
        <section className={`seo-social-card ${previewTab === 'Social Media' ? 'is-expanded' : ''}`} aria-label="Social media preview"><h4>Social Media Preview ({platform})</h4>{previewTab === 'Social Media' && <select aria-label="Social preview platform" value={platform} onChange={event => setPlatform(event.target.value)}><option>Facebook</option><option>LinkedIn</option><option>X</option></select>}<div className={`seo-social-post ${platform === 'X' ? 'is-x' : ''}`}><img src={draft.image} alt={`Social preview for ${draft.page}`} /><div><span>{previewUrl.domain}</span><strong>{draft.title || 'Your page title'}</strong><p>{draft.description || 'Your meta description will appear here.'}</p></div></div></section>
      </div></section></div>
      <div className="mw-editor-actions seo-editor-actions"><button type="button" className="mw-button" onClick={() => { const original = pages.find(item => item.id === draft.id); if (original) edit(original); setNotice('Changes cancelled.'); }}>Cancel</button><button type="submit" form="seo-meta-form" className="mw-button mw-primary">Save SEO &amp; Meta</button></div>
    </section></div>
  </div>;
}
