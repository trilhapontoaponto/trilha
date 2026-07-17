export default function Marca() {
  return (
    <div className="marca">
      <svg
        className="simbolo"
        viewBox="0 0 200 90"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Símbolo Trilha: sequência de pontos conectados"
      >
        <line x1="20" y1="70" x2="180" y2="20" stroke="oklch(32% 0.09 258)" strokeWidth="2" strokeLinecap="round" />
        <circle cx="20" cy="70" r="7" fill="oklch(32% 0.09 258)" />
        <circle cx="60" cy="58" r="7" fill="oklch(32% 0.09 258)" />
        <circle cx="100" cy="45" r="7" fill="oklch(32% 0.09 258)" />
        <circle cx="140" cy="33" r="7" fill="oklch(98% 0.006 90)" stroke="oklch(32% 0.09 258)" strokeWidth="2" />
        <circle cx="180" cy="20" r="8" fill="oklch(52% 0.11 75)" />
      </svg>
      <span className="nome">Trilha</span>
      <span className="slogan">estudos de ponto a ponto.</span>
    </div>
  )
}
