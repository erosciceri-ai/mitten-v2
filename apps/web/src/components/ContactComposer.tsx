import { FormEvent, useState } from 'react';

export function buildContactMailto(email: string, name: string, topic: string, message: string): string {
  const subject = `Consulta MITTEN · ${topic}`;
  const body = [`Nombre: ${name.trim() || 'No indicado'}`, '', message.trim()].join('\n');
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function ContactComposer({ email }: { email: string }) {
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('Consulta sobre el proyecto');
  const [message, setMessage] = useState('');

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    window.location.href = buildContactMailto(email, name, topic, message);
  };

  return (
    <form className="contact-form" onSubmit={handleSubmit}>
      <div className="contact-form__row">
        <label>
          <span>Tu nombre</span>
          <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" maxLength={80} />
        </label>
        <label>
          <span>Motivo</span>
          <select value={topic} onChange={(event) => setTopic(event.target.value)}>
            <option>Consulta sobre el proyecto</option>
            <option>Solicitar una demostración</option>
            <option>Proponer una colaboración</option>
          </select>
        </label>
      </div>
      <label>
        <span>Mensaje</span>
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          required
          minLength={10}
          maxLength={1200}
          rows={4}
          placeholder="Contanos brevemente cómo podemos ayudarte."
        />
      </label>
      <div className="contact-form__footer">
        <p>Al continuar se abrirá tu aplicación de correo. MITTEN no guarda este mensaje.</p>
        <button className="button button--light" type="submit">Preparar correo</button>
      </div>
    </form>
  );
}
