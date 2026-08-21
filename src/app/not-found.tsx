'use client'

import Link from 'next/link'

export default function NotFound() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#08080d',
      color: '#e2e8f0',
      fontFamily: 'system-ui, sans-serif',
      padding: '20px',
      textAlign: 'center'
    }}>
      <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🧠</div>
      <h1 style={{ fontSize: '2rem', fontWeight: 700, marginBottom: '0.5rem', color: '#fff' }}>
        404 — Stránka nenalezena / Not Found
      </h1>
      <p style={{ color: '#94a3b8', marginBottom: '1.5rem', maxWidth: '400px' }}>
        Zadaná stránka neexistuje nebo byla přesunuta.
      </p>
      <Link
        href="/"
        style={{
          background: 'linear-gradient(135deg, #7c6af7, #6350ff)',
          color: '#fff',
          padding: '10px 20px',
          borderRadius: '10px',
          textDecoration: 'none',
          fontWeight: 600,
          fontSize: '0.9rem'
        }}
      >
        ← Zpět do Znalostní báze
      </Link>
    </div>
  )
}
