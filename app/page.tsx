export default function Home() {
  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.75rem",
        flex: 1,
        textAlign: "center",
        padding: "2rem",
      }}
    >
      <h1 style={{ fontSize: "2.5rem", fontWeight: 600 }}>Hello, world 👋</h1>
      <p style={{ opacity: 0.7 }}>humor-project — Next.js on Vercel</p>
    </main>
  );
}
