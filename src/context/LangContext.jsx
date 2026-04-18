import { createContext, useContext, useState } from 'react'

export const LANGS = ['EN', 'ES', 'PT']

/* ── Translation table ── */
const TR = {
  EN: {
    submit: 'Submit',
    submitSong: 'Submit Song',
    submitSongSub: 'Get your track in front of curators',
    submitPlaylist: 'Submit Playlist',
    submitPlaylistSub: 'List your playlist as a curator',
    dashboard: 'Dashboard',
    settings: 'Settings',
    pricing: 'Pricing',
    blog: 'Blog',
    tools: 'Tools',
    signOut: 'Sign out',
    logIn: 'Log in',
    getStarted: 'Get Started',
    credits: 'CR',
  },
  ES: {
    submit: 'Enviar',
    submitSong: 'Enviar Canción',
    submitSongSub: 'Coloca tu pista frente a curadores',
    submitPlaylist: 'Enviar Playlist',
    submitPlaylistSub: 'Lista tu playlist como curador',
    dashboard: 'Panel',
    settings: 'Ajustes',
    pricing: 'Precios',
    blog: 'Blog',
    tools: 'Herramientas',
    signOut: 'Cerrar sesión',
    logIn: 'Iniciar sesión',
    getStarted: 'Empezar',
    credits: 'CR',
  },
  PT: {
    submit: 'Enviar',
    submitSong: 'Enviar Música',
    submitSongSub: 'Coloque sua faixa na frente dos curadores',
    submitPlaylist: 'Enviar Playlist',
    submitPlaylistSub: 'Liste sua playlist como curador',
    dashboard: 'Painel',
    settings: 'Configurações',
    pricing: 'Preços',
    blog: 'Blog',
    tools: 'Ferramentas',
    signOut: 'Sair',
    logIn: 'Entrar',
    getStarted: 'Começar',
    credits: 'CR',
  },
}

const LangCtx = createContext({ lang: 'EN', setLang: () => {}, t: k => k })

export function LangProvider({ children }) {
  const [lang, setLang] = useState(() => {
    try { return localStorage.getItem('se_lang') || 'EN' } catch { return 'EN' }
  })

  const handleSetLang = (l) => {
    setLang(l)
    try { localStorage.setItem('se_lang', l) } catch {}
  }

  const t = (key) => TR[lang]?.[key] ?? TR.EN[key] ?? key

  return (
    <LangCtx.Provider value={{ lang, setLang: handleSetLang, t }}>
      {children}
    </LangCtx.Provider>
  )
}

export function useLang() {
  return useContext(LangCtx)
}
