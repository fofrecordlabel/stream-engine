import { useState, useEffect } from 'react'
import { T } from '../tokens.js'
import NavBar from '../components/layout/NavBar.jsx'
import { POSTS } from './BlogPage.jsx'

export default function BlogPostPage({ setPage, postId, onBack }) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', fn, { passive:true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  // Scroll to top on mount
  useEffect(() => { window.scrollTo(0, 0) }, [postId])

  const post = POSTS.find(p => p.id === postId) ?? POSTS[0]

  return (
    <div style={{ minHeight:'100vh', background:T.bg, color:T.w }}>
      <NavBar setPage={setPage} scrolled={scrolled} />

      {/* Article container */}
      <div style={{ maxWidth:680, margin:'0 auto', padding:'100px 24px 100px' }}>

        {/* Back link */}
        <button onClick={onBack}
          style={{ display:'inline-flex', alignItems:'center', gap:6, marginBottom:40,
                   background:'none', border:'none', cursor:'pointer', padding:0,
                   fontSize:13, fontWeight:600, color:T.g300, transition:'color .15s' }}
          onMouseEnter={e => e.currentTarget.style.color = T.w}
          onMouseLeave={e => e.currentTarget.style.color = T.g300}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M13 8H3M7 12l-4-4 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back to Journal
        </button>

        {/* Category + meta */}
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
          <span style={{ display:'inline-block', fontSize:10.5, fontWeight:800,
                         letterSpacing:'.08em', textTransform:'uppercase',
                         color: post.categoryColor, padding:'3px 11px', borderRadius:20,
                         background:`${post.categoryColor}14`,
                         border:`1px solid ${post.categoryColor}28` }}>
            {post.category}
          </span>
          <span style={{ fontSize:12, color:T.g300 }}>{post.date}</span>
          <span style={{ width:3, height:3, borderRadius:'50%', background:T.g400 }} />
          <span style={{ fontSize:12, color:T.g300 }}>{post.readTime}</span>
        </div>

        {/* Title */}
        <h1 style={{ fontSize:'clamp(28px,4vw,44px)', fontWeight:900, lineHeight:1.12,
                     letterSpacing:'-.03em', color:T.w, marginBottom:28 }}>
          {post.title}
        </h1>

        {/* Excerpt / lede */}
        <p style={{ fontSize:18, lineHeight:1.72, color:T.g200, fontWeight:400,
                    borderLeft:`3px solid ${post.categoryColor}`, paddingLeft:20,
                    marginBottom:48, fontStyle:'italic' }}>
          {post.excerpt}
        </p>

        {/* Divider */}
        <div style={{ height:1, background:`linear-gradient(90deg,${post.categoryColor}30,transparent)`,
                      marginBottom:48 }} />

        {/* Body paragraphs */}
        <div style={{ display:'flex', flexDirection:'column', gap:24 }}>
          {post.body.map((para, i) => (
            <p key={i}
              style={{ fontSize:16.5, lineHeight:1.82, color: i === 0 ? T.g50 : T.g200,
                       fontWeight: i === 0 ? 500 : 400, margin:0 }}>
              {para}
            </p>
          ))}
        </div>

        {/* Bottom divider + CTA */}
        <div style={{ marginTop:64, paddingTop:40, borderTop:`1px solid ${T.b0}` }}>
          <div style={{ fontSize:11, fontWeight:800, letterSpacing:'.1em', textTransform:'uppercase',
                        color:T.g400, marginBottom:16 }}>
            StreamEngine Journal
          </div>
          <p style={{ fontSize:14, color:T.g300, marginBottom:24 }}>
            Ready to put what you learned into practice?
          </p>
          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            <button onClick={() => setPage('submit')} className="bp"
              style={{ padding:'11px 24px', fontSize:13.5 }}>
              Submit a Track <span className="arr">→</span>
            </button>
            <button onClick={onBack}
              style={{ padding:'11px 20px', borderRadius:10, background:'none',
                       border:`1px solid ${T.b1}`, color:T.g200, fontSize:13.5,
                       fontWeight:600, cursor:'pointer', transition:'all .15s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = T.b2; e.currentTarget.style.color = T.w }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.b1; e.currentTarget.style.color = T.g200 }}>
              More Articles
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
