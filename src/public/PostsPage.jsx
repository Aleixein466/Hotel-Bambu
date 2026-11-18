import { useState } from 'react';
import { Link } from 'react-router-dom';
import { usePublicPosts } from '../api/public.js';
import { POST_KIND } from '../lib/format.js';
import { EmptyState, ErrorState, Loading } from '../ui/Feedback.jsx';
import { ConceptBadge, Photo } from './parts.jsx';
import { formatTsDate, usePageTitle } from './shared.js';

export default function PostsPage() {
  usePageTitle('Novedades');
  const [kind, setKind] = useState('');
  const { data: posts, isLoading, error, refetch } = usePublicPosts(kind || undefined);

  return (
    <>
      <section className="page-hero">
        <span className="eyebrow">Novedades</span>
        <h1>Noticias y promociones.</h1>
        <p>Lo último del hotel: noticias, promociones y ofertas especiales vigentes.</p>
      </section>
      <div className="toolbar">
        <div className="filter-chips" role="group" aria-label="Filtrar publicaciones">
          {[['', 'Todas'], ...Object.entries(POST_KIND)].map(([value, label]) => (
            <button key={value || 'all'} type="button" className={`chip${kind === value ? ' active' : ''}`} aria-pressed={kind === value} onClick={() => setKind(value)}>{label}</button>
          ))}
        </div>
      </div>
      {isLoading && <Loading />}
      {error && <ErrorState error={error} onRetry={refetch} />}
      {posts && (posts.length === 0
        ? <EmptyState title="No hay publicaciones por ahora.">Vuelve pronto para ver novedades del hotel.</EmptyState>
        : (
          <section className="post-grid page-posts">
            {posts.map(post => (
              <article className="post-card" key={post.id}>
                {post.cover && (
                  <Link className="post-cover" to={`/novedades/${post.slug}`} tabIndex={-1} aria-hidden="true">
                    <Photo media={post.cover} thumb alt="" />
                    <ConceptBadge media={post.cover} />
                  </Link>
                )}
                <div className="post-copy">
                  <span className="post-kind">{POST_KIND[post.kind] || post.kind}</span>
                  <h3><Link to={`/novedades/${post.slug}`}>{post.title}</Link></h3>
                  {post.excerpt && <p>{post.excerpt}</p>}
                  <small>
                    {post.published_at && formatTsDate(post.published_at)}
                    {post.ends_at && ` · Vigente hasta ${formatTsDate(post.ends_at)}`}
                  </small>
                </div>
              </article>
            ))}
          </section>
        ))}
    </>
  );
}
