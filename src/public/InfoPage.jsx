import { usePublicSettings, useSiteContent } from '../api/public.js';
import { ErrorState, Loading } from '../ui/Feedback.jsx';
import { Paragraphs } from './parts.jsx';
import { usePageTitle } from './shared.js';

const list = value => (Array.isArray(value?.items) ? value.items : []);

export default function InfoPage() {
  usePageTitle('Información');
  const contentQ = useSiteContent();
  const settingsQ = usePublicSettings();

  if (contentQ.isLoading || settingsQ.isLoading) return <Loading />;
  const error = contentQ.error || settingsQ.error;
  if (error) return <ErrorState error={error} onRetry={() => { contentQ.refetch(); settingsQ.refetch(); }} />;

  const content = contentQ.data || {};
  const s = settingsQ.data || {};
  const faq = list(content.faq).filter(i => i.q && i.a);
  const policies = list(content.policies).filter(i => i.title && i.body);
  const institutional = content.about?.institutional?.trim();
  const bookingPolicy = s.booking_policy?.trim();
  const hasTimes = Boolean(s.check_in_time || s.check_out_time);
  const empty = !faq.length && !policies.length && !institutional && !bookingPolicy && !hasTimes;

  return (
    <>
      <section className="page-hero">
        <span className="eyebrow">Información</span>
        <h1>Lo que debes saber.</h1>
        <p>Horarios, políticas y respuestas a las preguntas más frecuentes.</p>
      </section>
      <div className="info-page">
        {empty && <p className="info-empty">El hotel aún no ha publicado información adicional. Puedes consultarle directamente desde la sección de contacto.</p>}

        {institutional && <section className="info-section"><h2>Sobre el hotel</h2><Paragraphs text={institutional} /></section>}

        {hasTimes && (
          <section className="info-section">
            <h2>Horarios</h2>
            <div className="info-times">
              {s.check_in_time && <div><span>Entrada</span><strong>{s.check_in_time}</strong></div>}
              {s.check_out_time && <div><span>Salida</span><strong>{s.check_out_time}</strong></div>}
            </div>
          </section>
        )}

        {bookingPolicy && <section className="info-section"><h2>Política de reservas</h2><Paragraphs text={bookingPolicy} /></section>}

        {policies.length > 0 && (
          <section className="info-section">
            <h2>Políticas del hotel</h2>
            {policies.map((p, i) => <article className="info-item" key={i}><h3>{p.title}</h3><Paragraphs text={p.body} /></article>)}
          </section>
        )}

        {faq.length > 0 && (
          <section className="info-section">
            <h2>Preguntas frecuentes</h2>
            {faq.map((item, i) => (
              <details className="faq-item" key={i}>
                <summary>{item.q}</summary>
                <Paragraphs text={item.a} />
              </details>
            ))}
          </section>
        )}
      </div>
    </>
  );
}
