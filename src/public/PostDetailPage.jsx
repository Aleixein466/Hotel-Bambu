import { Link, useParams } from 'react-router-dom';
import { usePublicPost } from '../api/public.js';
import { POST_KIND } from '../lib/format.js';
import { ErrorState, Loading } from '../ui/Feedback.jsx';
import { NotFoundContent } from './NotFoundPage.jsx';
import { ConceptBadge, Paragraphs, Photo } from './parts.jsx';
import { formatTsDate, usePageTitle } from './shared.js';

export default function PostDetailPage() {
  const { slug } = useParams();
  const { data: post, isLoading, error, refetch } = usePublicPost(slug);
  usePageTitle(post?.title || 'Novedades');

  if (isLoading) return <Loading />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;
  if (!post) return <NotFoundContent title="Esta publicación no está disponible" message="Puede que haya terminado su vigencia o que ya no esté publicada." />;

  return (
    <article className="post-detail">
      <Link to="/novedades" className="eyebrow">← Todas las novedades</Link>
      <span className="post-kind">{POST_KIND[post.kind] || post.kind}</span>
      <h1>{post.title}</h1>
      <p className="post-meta">
        {post.published_at && formatTsDate(post.published_at)}
        {post.ends_at && ` · Vigente hasta ${formatTsDate(post.ends_at)}`}
      </p>
      {post.cover && (
        <figure className="post-hero-image">
          <Photo media={post.cover} loading="eager" />
          <ConceptBadge media={post.cover} />
        </figure>
      )}
      {post.excerpt && <p className="lead">{post.excerpt}</p>}
      <div className="post-body"><Paragraphs text={post.body} /></div>
    </article>
  );
}
