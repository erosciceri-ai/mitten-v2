import { lazy, Suspense, type CSSProperties, useEffect, useState } from 'react';

const SignalWaves = lazy(() => import('./react-bits/Waves/Waves'));

type DemoStage = 'idle' | 'sensing' | 'matching' | 'example';

const stages: Record<DemoStage, { label: string; detail: string }> = {
  idle: {
    label: 'Recorrido de ejemplo',
    detail: 'Esta animación explica los pasos; no lee sensores ni ejecuta el reconocimiento.',
  },
  sensing: {
    label: 'Muestra conceptual',
    detail: 'En el guante, cinco sensores flex y el MPU6050 forman una muestra de siete dimensiones. Estos valores son ilustrativos.',
  },
  matching: {
    label: 'Paso de reconocimiento',
    detail: 'El firmware compara la muestra con el perfil sincronizado. Esta animación no ejecuta el algoritmo.',
  },
  example: {
    label: 'Salida de ejemplo',
    detail: 'El firmware busca un WAV local asociado. Esta demostración no reproduce audio real.',
  },
};

const sensorValues = [72, 41, 84, 56, 35];

export function ProjectDemo() {
  const [stage, setStage] = useState<DemoStage>('idle');

  useEffect(() => {
    if (stage === 'idle' || stage === 'example') return undefined;

    const timer = window.setTimeout(() => {
      setStage(stage === 'sensing' ? 'matching' : 'example');
    }, 1100);

    return () => window.clearTimeout(timer);
  }, [stage]);

  const running = stage === 'sensing' || stage === 'matching';

  return (
    <section className="public-section demo-section" id="demostracion" aria-labelledby="demo-title">
      <div className="public-container demo-grid">
        <div className="section-heading demo-copy">
          <h2 id="demo-title">Seguí una señal mientras se convierte en voz.</h2>
          <p>
            Esta secuencia explica el recorrido de los datos. No simula la precisión del reconocimiento
            ni sustituye una prueba con el guante físico.
          </p>
          <button
            className="button button--primary"
            type="button"
            disabled={running}
            onClick={() => setStage('sensing')}
          >
            {stage === 'example' ? 'Repetir recorrido' : running ? 'Mostrando recorrido…' : 'Ver recorrido conceptual'}
          </button>
        </div>

        <div className={`signal-console signal-console--${stage}`}>
          <Suspense fallback={null}>
            <SignalWaves className="signal-console__waves" lineColor="#00D3DD" backgroundColor="transparent" waveAmpX={18} waveAmpY={8} xGap={18} yGap={42} maxCursorMove={24} />
          </Suspense>
          <div className="signal-console__topline">
            <span>MITTEN / recorrido conceptual</span>
            <span className="signal-console__state" aria-live="polite">{stages[stage].label}</span>
          </div>

          <div className="signal-console__sensors" aria-label="Lecturas conceptuales de los cinco sensores flex">
            {sensorValues.map((value, index) => (
              <div className="sensor-channel" key={`${value}-${index}`}>
                <span>F{index + 1}</span>
                <div aria-hidden="true"><i style={{ '--sensor-scale': value / 100 } as CSSProperties} /></div>
                <strong>{stage === 'idle' ? '—' : value}</strong>
              </div>
            ))}
          </div>

          <div className="signal-console__route" aria-label="Etapas de la demostración">
            <div className={stage !== 'idle' ? 'is-active' : ''}><span>01</span><strong>Sensores</strong></div>
            <i aria-hidden="true" />
            <div className={stage === 'matching' || stage === 'example' ? 'is-active' : ''}><span>02</span><strong>ESP32</strong></div>
            <i aria-hidden="true" />
            <div className={stage === 'example' ? 'is-active' : ''}><span>03</span><strong>WAV</strong></div>
          </div>

          <div className="signal-console__result">
            <span>{stage === 'example' ? 'Mensaje de ejemplo' : 'Estado del recorrido'}</span>
            <strong>{stage === 'example' ? '“Necesito ayuda”' : stages[stage].detail}</strong>
          </div>
        </div>
      </div>
    </section>
  );
}
