/** Tarmoq effekti sxemasi: mijozlar <-> agentlar tarmog'i <-> bizneslar. Har yangi tugun ikki tomonga qiymat qo'shadi. */
export function NetworkDiagram() {
  const clients = [60, 150, 240];
  const biz = [60, 150, 240];
  return (
    <figure>
      <svg viewBox="0 0 640 300" role="img" aria-labelledby="net-t net-d" className="h-auto w-full">
        <title id="net-t">Tarmoq effekti sxemasi</title>
        <desc id="net-d">Chapda mijozlar va ularning shaxsiy agentlari, o&apos;ngda bizneslar va ularning agentlari, o&apos;rtada Botir tarmog&apos;i. Ko&apos;proq biznes mijozlarga ko&apos;proq tanlov beradi, ko&apos;proq mijoz bizneslarga ko&apos;proq buyurtma beradi.</desc>
        {clients.map((y) =>
          biz.map((y2) => <line key={`${y}-${y2}`} x1="170" y1={y} x2="470" y2={y2} stroke="#b2bdb4" strokeWidth="1.5" className="flow-line" />),
        )}
        {clients.map((y) => (
          <g key={`c${y}`}>
            <line x1="70" y1={y} x2="170" y2={y} stroke="#556158" strokeWidth="2" />
            <circle cx="50" cy={y} r="20" fill="#f4f6f4" stroke="#556158" strokeWidth="2" />
            <text x="50" y={y + 5} textAnchor="middle" fontSize="15" fill="#444e47">👤</text>
            <rect x="160" y={y - 14} width="22" height="28" rx="7" fill="#6e7b71" />
          </g>
        ))}
        {biz.map((y) => (
          <g key={`b${y}`}>
            <line x1="470" y1={y} x2="570" y2={y} stroke="#b45309" strokeWidth="2" />
            <rect x="458" y={y - 14} width="22" height="28" rx="7" fill="#f59e0b" />
            <circle cx="590" cy={y} r="20" fill="#fffbeb" stroke="#b45309" strokeWidth="2" />
            <text x="590" y={y + 5} textAnchor="middle" fontSize="15">🏪</text>
          </g>
        ))}
        <circle cx="320" cy="150" r="70" fill="#f4f6f4" />
        <circle cx="320" cy="150" r="56" fill="#e8ece8" stroke="#556158" strokeWidth="2" className="node-pulse" />
        <text x="320" y="146" textAnchor="middle" fontSize="13" fontWeight="700" fill="#2b312d">Life Assistant</text>
        <text x="320" y="166" textAnchor="middle" fontSize="12" fill="#444e47">tarmog&apos;i</text>
        <text x="50" y="288" textAnchor="middle" fontSize="12" fill="#404040">Mijozlar</text>
        <text x="590" y="288" textAnchor="middle" fontSize="12" fill="#404040">Bizneslar</text>
      </svg>
      <figcaption className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
        <p><strong className="text-foreground">Ko&apos;proq biznes</strong> mijozga ko&apos;proq tanlov va yaxshi narx beradi.</p>
        <p><strong className="text-foreground">Ko&apos;proq mijoz</strong> bizneslarga ko&apos;proq buyurtma olib keladi.</p>
      </figcaption>
    </figure>
  );
}
