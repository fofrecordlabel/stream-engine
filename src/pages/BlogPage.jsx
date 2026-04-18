import { useState, useEffect } from 'react'
import { T } from '../tokens.js'
import NavBar from '../components/layout/NavBar.jsx'

export const POSTS = [
  {
    id: 'p1',
    category: 'Curation',
    categoryColor: '#7fff00',
    title: 'How Curators Actually Decide Which Tracks to Add',
    excerpt: 'We talked to 12 playlist curators about their real selection process — and most artists have it completely backwards.',
    date: 'Apr 12, 2025',
    readTime: '5 min read',
    featured: true,
    body: [
      'Most artists assume curators are listening for the "best" track. That\'s not how it works. Curators are building moods, not merit lists.',
      'We spent three weeks interviewing 12 active playlist curators across hip-hop, R&B, and electronic genres. The single most repeated phrase: "Does this track fit where I\'m taking the playlist right now?"',
      'That\'s a moving target. A curator running a lo-fi study playlist in January might be shifting toward more energetic sounds by spring. Your track might be objectively good and still get passed over because of timing.',
      'What actually moves the needle: a Spotify URL with a strong first 15 seconds, a genre that matches the playlist description (not just the playlist name), and a short, honest pitch note that doesn\'t read like a press release.',
      'The curators who responded fastest said they skip pitches with no Spotify link, no context, and vague genre labels like "pop/r&b/hip-hop." Pick one. Be specific.',
      'Treat playlist placement like editorial pitching, not auditions. Know the playlist, know the mood, know the moment — then submit.',
    ],
  },
  {
    id: 'p2',
    category: 'Growth',
    categoryColor: '#38bdf8',
    title: 'The First 1,000 Streams Are the Hardest. Here\'s Why.',
    excerpt: 'Spotify\'s algorithm doesn\'t care about you until you prove other people do. The math behind momentum.',
    date: 'Apr 8, 2025',
    readTime: '4 min read',
    featured: false,
    body: [
      'Streaming platforms use engagement signals — save rate, skip rate, playlist adds — to decide whether to serve your track to new listeners. But those signals require listeners in the first place.',
      'It\'s a bootstrapping problem. The algorithm ignores cold tracks. You have to generate enough heat yourself before it notices.',
      'The most reliable path: curator placements that put you in front of audiences already primed for your genre. A single 200K-follower playlist placement can flip a track from 80 streams to 4,000 in a week.',
      'Once the algorithm sees that surge and a save rate above 8–10%, it starts including your track in radio and release radar for similar listeners. That\'s when organic growth compounds.',
      'The mistake most artists make is releasing and waiting. You have about two weeks before a track\'s algorithmic window closes. Move fast, pitch aggressively, and treat the first two weeks like a sprint.',
    ],
  },
  {
    id: 'p3',
    category: 'Tips',
    categoryColor: '#ffc740',
    title: 'Genre Tagging Is Killing Your Discoverability',
    excerpt: 'Picking five genres might feel safer. It\'s not. Here\'s what the data says about over-tagging on streaming platforms.',
    date: 'Apr 3, 2025',
    readTime: '3 min read',
    featured: false,
    body: [
      'When you tag your track with five genres, you\'re not increasing discoverability. You\'re diluting it.',
      'Streaming platforms use genre signals to slot your track into listener recommendation pools. When those signals conflict, the algorithm hedges — and usually deprioritizes you in all of them.',
      'The artists seeing the highest playlist add rates are the ones with one primary genre and at most one secondary. "Hip-hop" lands better than "hip-hop/r&b/soul/pop/trap."',
      'Be specific. Be honest about what you actually made. Specificity converts.',
    ],
  },
  {
    id: 'p4',
    category: 'Analytics',
    categoryColor: '#a78bfa',
    title: 'What to Actually Look At in Spotify for Artists',
    excerpt: 'Most artists check streams and followers. The numbers that actually tell you something are buried three tabs deep.',
    date: 'Mar 28, 2025',
    readTime: '6 min read',
    featured: false,
    body: [
      'Streams are a vanity metric until you understand where they\'re coming from. A track with 10,000 streams from playlist placements is fundamentally different from 10,000 streams from your existing fans replaying it.',
      'The numbers worth watching: source of streams, save rate, playlist reach, and listener-to-follower conversion.',
      'A high save rate — above 10% — tells you the algorithm is likely to extend your reach. A low one suggests listeners aren\'t connecting, even if stream counts look decent.',
      'Check these weekly, not daily. Daily variance is noise. Weekly trends are signal.',
    ],
  },
  {
    id: 'p5',
    category: 'Tips',
    categoryColor: '#ffc740',
    title: 'The Pitch Note That Gets Curators to Actually Listen',
    excerpt: 'Two sentences. That\'s all you need. We analyzed 500 accepted submissions to find the pattern.',
    date: 'Mar 22, 2025',
    readTime: '3 min read',
    featured: false,
    body: [
      'After reviewing over 500 accepted curator submissions, a pattern emerged: the pitch notes that converted were almost always two to three sentences max.',
      'Formula: [Track name] is a [specific genre] track at [BPM] BPM. It fits your [specific playlist name] because [one concrete reason]. Here\'s the link.',
      'What doesn\'t work: anything that reads like a press release, comparisons to famous artists, and pitches that don\'t mention the curator\'s specific playlist by name.',
      'Write your pitch note after listening to the curator\'s playlist three times. If you can\'t name a specific reason your track fits, don\'t submit to them.',
    ],
  },
]

/* ── Category badge ── */
function CatBadge({ label, color }) {
  return (
    <span style={{ display:'inline-block', fontSize:10.5, fontWeight:800,
                   letterSpacing:'.08em', textTransform:'uppercase', color,
                   padding:'3px 11px', borderRadius:20,
                   background:`${color}14`, border:`1px solid ${color}28` }}>
      {label}
    </span>
  )
}

/* ── Featured article ── */
function FeaturedCard({ post, onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <div onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ cursor:'pointer', borderRadius:20, overflow:'hidden',
               background:'linear-gradient(145deg,#111114,#0d0d10)',
               border:`1px solid ${hov ? T.b1 : T.b0}`,
               transition:'border-color .2s, transform .2s',
               transform: hov ? 'translateY(-2px)' : 'none',
               marginBottom:48 }}>
      {/* Editorial band */}
      <div style={{ height:200, position:'relative', overflow:'hidden',
                    background:'linear-gradient(135deg,#0e1a0e 0%,#0d0d10 50%,#0a0a14 100%)',
                    display:'flex', alignItems:'flex-end', padding:'24px 32px' }}>
        <div style={{ position:'absolute', inset:0,
                      backgroundImage:'radial-gradient(circle at 25% 60%, rgba(127,255,0,.09) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(127,255,0,.04) 0%, transparent 45%)' }} />
        <div style={{ position:'absolute', top:20, right:28, fontSize:11, fontWeight:700,
                      color:T.gn, letterSpacing:'.1em', textTransform:'uppercase',
                      background:'rgba(127,255,0,.1)', border:`1px solid ${T.gnB}`,
                      borderRadius:20, padding:'3px 12px' }}>
          Featured
        </div>
        <CatBadge label={post.category} color={post.categoryColor} />
      </div>

      <div style={{ padding:'28px 32px 32px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
          <span style={{ fontSize:12, color:T.g300 }}>{post.date}</span>
          <span style={{ width:3, height:3, borderRadius:'50%', background:T.g400 }} />
          <span style={{ fontSize:12, color:T.g300 }}>{post.readTime}</span>
        </div>
        <h2 style={{ fontSize:'clamp(20px,2.8vw,30px)', fontWeight:900, lineHeight:1.18,
                     letterSpacing:'-.02em', color:T.w, marginBottom:14, maxWidth:600 }}>
          {post.title}
        </h2>
        <p style={{ fontSize:15.5, color:T.g200, lineHeight:1.7, maxWidth:540, marginBottom:24 }}>
          {post.excerpt}
        </p>
        <span style={{ fontSize:13, fontWeight:700, color:post.categoryColor,
                       display:'inline-flex', alignItems:'center', gap:5 }}>
          Read article
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
            style={{ transform: hov ? 'translateX(3px)' : 'none', transition:'transform .15s' }}>
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      </div>
    </div>
  )
}

/* ── Article card ── */
function ArticleCard({ post, onClick }) {
  const [hov, setHov] = useState(false)
  return (
    <div onClick={onClick}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ cursor:'pointer', borderRadius:16, padding:'22px 22px 20px',
               background:'linear-gradient(145deg,#101013,#0d0d10)',
               border:`1px solid ${hov ? T.b1 : T.b0}`,
               transition:'border-color .15s, transform .15s',
               transform: hov ? 'translateY(-2px)' : 'none',
               display:'flex', flexDirection:'column', gap:11 }}>
      <CatBadge label={post.category} color={post.categoryColor} />
      <h3 style={{ fontSize:16, fontWeight:800, lineHeight:1.32, letterSpacing:'-.01em',
                   color:T.w, margin:0 }}>
        {post.title}
      </h3>
      <p style={{ fontSize:13, color:T.g200, lineHeight:1.65, margin:0, flex:1 }}>
        {post.excerpt}
      </p>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                    paddingTop:10, borderTop:`1px solid ${T.b0}` }}>
        <span style={{ fontSize:11.5, color:T.g300 }}>{post.date} · {post.readTime}</span>
        <span style={{ fontSize:12, fontWeight:700, color:post.categoryColor,
                       display:'inline-flex', alignItems:'center', gap:4 }}>
          Read
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none"
            style={{ transform: hov ? 'translateX(2px)' : 'none', transition:'transform .15s' }}>
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </span>
      </div>
    </div>
  )
}

/* ── Blog index ── */
export default function BlogPage({ setPage, onPost }) {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 10)
    window.addEventListener('scroll', fn, { passive:true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  const featured = POSTS.find(p => p.featured)
  const rest     = POSTS.filter(p => !p.featured)

  return (
    <div style={{ minHeight:'100vh', background:T.bg, color:T.w }}>
      <NavBar setPage={setPage} scrolled={scrolled} />

      <div className="se-shell" style={{ maxWidth:860, margin:'0 auto', paddingTop:100, paddingBottom:80 }}>

        {/* Editorial header */}
        <div style={{ marginBottom:52, paddingBottom:40, borderBottom:`1px solid ${T.b0}`, textAlign:'center' }}>
          <div style={{ fontSize:10.5, fontWeight:800, letterSpacing:'.16em', textTransform:'uppercase',
                        color:T.g400, marginBottom:16 }}>
            StreamEngine Journal
          </div>
          <h1 style={{ fontSize:'clamp(34px,5vw,54px)', fontWeight:900, letterSpacing:'-.03em',
                       lineHeight:1.06, color:T.w, marginBottom:16 }}>
            For artists who take<br/>their music seriously.
          </h1>
          <p style={{ fontSize:16, color:T.g300, lineHeight:1.65, maxWidth:560, margin:'0 auto' }}>
            Curation strategy, platform growth, and everything between your upload and your first 10,000 streams.
          </p>
        </div>

        {/* Featured */}
        <FeaturedCard post={featured} onClick={() => onPost(featured.id)} />

        {/* Article grid */}
        <div style={{ fontSize:10.5, fontWeight:800, letterSpacing:'.12em', textTransform:'uppercase',
                      color:T.g400, marginBottom:16 }}>
          All Articles
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(258px,1fr))', gap:14 }}>
          {rest.map(post => (
            <ArticleCard key={post.id} post={post} onClick={() => onPost(post.id)} />
          ))}
        </div>
      </div>
    </div>
  )
}
