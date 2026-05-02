import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from './supabaseClient'
import { SECTORS, sectorTheme, sectorLabel, makeInitials, timeAgo } from './format'
import './Jobs.css'

const JOB_TYPES = [
  { value: 'full-time',  label: 'Full-time' },
  { value: 'part-time',  label: 'Part-time' },
  { value: 'contract',   label: 'Contract' },
  { value: 'internship', label: 'Internship' },
]

const EXPERIENCE_LEVELS = [
  { value: 'entry',     label: 'Entry' },
  { value: 'mid',       label: 'Mid' },
  { value: 'senior',    label: 'Senior' },
  { value: 'executive', label: 'Executive' },
]

function jobTypeLabel(v) {
  return JOB_TYPES.find(t => t.value === v)?.label || (v ? v : 'Full-time')
}
function experienceLabel(v) {
  if (!v) return null
  return EXPERIENCE_LEVELS.find(e => e.value === v)?.label || v
}

const HOUR = 3600 * 1000
const ago = (h) => new Date(Date.now() - h * HOUR).toISOString()

const FALLBACK_JOBS = [
  {
    id: 'sample-1',
    title: 'Senior Research Associate, Cardiology',
    company: { id: null, display_name: 'Vesalia Bio', sector: 'biotech' },
    location: 'Boston, MA',
    sector: 'biotech',
    job_type: 'full-time',
    experience_level: 'senior',
    salary_range: '$140K – $180K',
    description: "We're looking for a senior research associate to lead protocol design for our Phase I trials of the continuous glucose monitoring patch. You'll partner directly with our clinical sites on study coordination, work hands-on in the wet lab, and own the IRB documentation pipeline.\n\nThis role reports to the VP of Clinical and is a great fit for someone with 6+ years of bench-to-bedside experience.",
    created_at: ago(6),
    is_sample: true,
  },
  {
    id: 'sample-2',
    title: 'Project Architect — Mixed-Use',
    company: { id: null, display_name: 'North Atrium Group', sector: 'realestate' },
    location: 'Austin, TX',
    sector: 'realestate',
    job_type: 'full-time',
    experience_level: 'senior',
    salary_range: '$110K – $145K',
    description: "Project architect for our 280K sq ft mixed-use development in East Austin. You'll own design coordination from schematic through construction documents, partnering closely with our civic-space integration consultants on the embedded library.\n\nExperience with mixed-use projects that integrate public space is essential. AIA license required.",
    created_at: ago(20),
    is_sample: true,
  },
  {
    id: 'sample-3',
    title: 'AI Regulation Associate',
    company: { id: null, display_name: 'Pierce Anders Wynn', sector: 'legal' },
    location: 'New York, NY (Hybrid)',
    sector: 'legal',
    job_type: 'full-time',
    experience_level: 'mid',
    salary_range: '$200K – $245K',
    description: "Join our newly-launched AI Regulation practice. You'll advise enterprise clients on EU AI Act compliance, US state-level frameworks, and risk-based audits. Day-to-day mixes regulatory analysis, drafting client memos, and partnering with technologists on audit methodology.\n\nJD required. 3–5 years of regulatory or technology law experience preferred.",
    created_at: ago(30),
    is_sample: true,
  },
  {
    id: 'sample-4',
    title: 'Senior Product Designer',
    company: { id: null, display_name: 'Lattice Cloud', sector: 'tech' },
    location: 'Remote (US)',
    sector: 'tech',
    job_type: 'full-time',
    experience_level: 'senior',
    salary_range: '$165K – $200K + equity',
    description: "Lead UX for our usage-based billing engine. You'll partner with engineering and GTM to ship the next major version of our pricing builder, and own the end-to-end experience for finance teams configuring complex hybrid plans.\n\n5+ years product design experience, ideally with B2B SaaS or developer tooling.",
    created_at: ago(40),
    is_sample: true,
  },
  {
    id: 'sample-5',
    title: 'Field Operations Lead',
    company: { id: null, display_name: 'Field & Furrow', sector: 'agriculture' },
    location: 'Sacramento, CA',
    sector: 'agriculture',
    job_type: 'full-time',
    experience_level: 'mid',
    salary_range: '$95K – $125K',
    description: "Lead our on-farm deployments for our soil-moisture network. You'll roll out installations and support growers across CA, AZ, and TX as we expand row-crop coverage.\n\nBackground in ag-tech, farm management, or agronomy required. Comfortable with travel and field work.",
    created_at: ago(56),
    is_sample: true,
  },
  {
    id: 'sample-6',
    title: 'Senior Consultant — Supply Chain',
    company: { id: null, display_name: 'Cogent Strategy Partners', sector: 'consulting' },
    location: 'Chicago, IL',
    sector: 'consulting',
    job_type: 'full-time',
    experience_level: 'senior',
    salary_range: '$180K – $230K',
    description: "Senior consultant role on our supply chain practice. You'll lead engagements on supplier risk, logistics network design, and post-2024 resilience strategy for Fortune 500 clients.\n\nMBA or equivalent experience preferred. Travel ~30%.",
    created_at: ago(72),
    is_sample: true,
  },
  {
    id: 'sample-7',
    title: 'Health-IT Integration Lead',
    company: { id: null, display_name: 'Meridian Health Network', sector: 'healthcare' },
    location: 'Cleveland, OH',
    sector: 'healthcare',
    job_type: 'full-time',
    experience_level: 'senior',
    salary_range: '$150K – $185K',
    description: "Senior IT integration lead to drive our EHR add-on replacements over the next 18 months — patient intake and care coordination across 14 hospital sites.\n\nStrong FHIR/HL7 experience and a track record of multi-site rollouts required. Healthcare-IT vendor management experience a plus.",
    created_at: ago(96),
    is_sample: true,
  },
  {
    id: 'sample-8',
    title: 'Mechanical Engineer — DAC Systems',
    company: { id: null, display_name: 'Caldera Climate', sector: 'climate' },
    location: 'Cheyenne, WY',
    sector: 'climate',
    job_type: 'full-time',
    experience_level: 'mid',
    salary_range: '$130K – $160K',
    description: "Mechanical engineer for our 1,000 t/yr direct-air-capture pilot. You'll work on absorber design, contactor optimization, and on-site commissioning at our Wyoming partner site.\n\nBSME required, 4+ years process or thermal systems experience. Willingness to travel to site as needed.",
    created_at: ago(120),
    is_sample: true,
  },
]

function adaptJob(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    location: row.location,
    sector: row.sector,
    job_type: row.job_type,
    experience_level: row.experience_level,
    salary_range: row.salary_range,
    created_at: row.created_at,
    company: row.company || null,
    is_sample: false,
  }
}

// =============================================================================
// Listings
// =============================================================================
function JobList({ user }) {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [activeSector, setActiveSector] = useState('All')
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [newJob, setNewJob] = useState({
    title: '',
    description: '',
    location: '',
    sector: SECTORS[0].value,
    job_type: 'full-time',
    experience_level: 'mid',
    salary_range: '',
  })

  const isCompany = user?.accountType === 'company'

  const fetchJobs = useCallback(async () => {
    const { data, error } = await supabase
      .from('jobs')
      .select('id, title, description, location, sector, job_type, experience_level, salary_range, created_at, is_active, company:profiles!company_id(id, display_name, sector)')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
    if (error) {
      console.warn('Jobs fetch failed:', error.message)
      setJobs([])
      return
    }
    setJobs((data || []).map(adaptJob))
  }, [])

  useEffect(() => {
    fetchJobs().finally(() => setLoading(false))
  }, [fetchJobs])

  const handleCreate = async () => {
    const title = newJob.title.trim()
    const description = newJob.description.trim()
    if (!title || !description || creating) return
    setCreating(true)
    const { data, error } = await supabase
      .from('jobs')
      .insert({
        company_id: user.id,
        title,
        description,
        location: newJob.location.trim() || null,
        sector: newJob.sector,
        job_type: newJob.job_type,
        experience_level: newJob.experience_level,
        salary_range: newJob.salary_range.trim() || null,
      })
      .select()
      .single()
    setCreating(false)
    if (error) { alert(error.message); return }
    setShowCreate(false)
    setNewJob({ title: '', description: '', location: '', sector: SECTORS[0].value, job_type: 'full-time', experience_level: 'mid', salary_range: '' })
    await fetchJobs()
    if (data?.id) navigate(`/jobs/${data.id}`)
  }

  const usingFallback = jobs.length === 0 && !loading
  const visibleJobs = jobs.length > 0 ? jobs : FALLBACK_JOBS

  const filteredJobs = visibleJobs.filter(j => {
    const q = search.toLowerCase()
    const matchesSearch = !q ||
      j.title.toLowerCase().includes(q) ||
      (j.company?.display_name || '').toLowerCase().includes(q)
    const matchesSector = activeSector === 'All' || sectorLabel(j.sector) === activeSector
    return matchesSearch && matchesSector
  })

  return (
    <div className="jobs-page">
      <div className="jobs-header">
        <div>
          <h2>Jobs</h2>
          <p className="jobs-subtitle">{visibleJobs.length} open role{visibleJobs.length === 1 ? '' : 's'}</p>
        </div>
        {isCompany && (
          <button className="jobs-create-btn" onClick={() => setShowCreate(s => !s)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Post a Job
          </button>
        )}
      </div>

      {showCreate && isCompany && (
        <div className="jobs-create-form">
          <h3>Post a Job</h3>
          <div className="jobs-form-row">
            <div className="jobs-form-group" style={{ gridColumn: 'span 2' }}>
              <label>Title</label>
              <input value={newJob.title} onChange={e => setNewJob({ ...newJob, title: e.target.value })} placeholder="e.g., Senior Product Designer" />
            </div>
            <div className="jobs-form-group">
              <label>Sector</label>
              <select value={newJob.sector} onChange={e => setNewJob({ ...newJob, sector: e.target.value })}>
                {SECTORS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <div className="jobs-form-row">
            <div className="jobs-form-group">
              <label>Location</label>
              <input value={newJob.location} onChange={e => setNewJob({ ...newJob, location: e.target.value })} placeholder="e.g., Remote (US) or Boston, MA" />
            </div>
            <div className="jobs-form-group">
              <label>Job Type</label>
              <select value={newJob.job_type} onChange={e => setNewJob({ ...newJob, job_type: e.target.value })}>
                {JOB_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="jobs-form-group">
              <label>Experience</label>
              <select value={newJob.experience_level} onChange={e => setNewJob({ ...newJob, experience_level: e.target.value })}>
                {EXPERIENCE_LEVELS.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
          </div>
          <div className="jobs-form-row">
            <div className="jobs-form-group" style={{ gridColumn: 'span 3' }}>
              <label>Salary Range (optional)</label>
              <input value={newJob.salary_range} onChange={e => setNewJob({ ...newJob, salary_range: e.target.value })} placeholder="e.g., $120K – $160K" />
            </div>
          </div>
          <div className="jobs-form-row">
            <div className="jobs-form-group" style={{ gridColumn: 'span 3' }}>
              <label>Description</label>
              <textarea value={newJob.description} onChange={e => setNewJob({ ...newJob, description: e.target.value })} placeholder="Describe the role, responsibilities, and what you're looking for." rows={6} />
            </div>
          </div>
          <div className="jobs-form-actions">
            <button className="jobs-cancel" onClick={() => setShowCreate(false)}>Cancel</button>
            <button className="jobs-submit" onClick={handleCreate} disabled={creating || !newJob.title.trim() || !newJob.description.trim()}>
              {creating ? 'Posting…' : 'Post Job'}
            </button>
          </div>
        </div>
      )}

      <div className="jobs-controls">
        <div className="jobs-search">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5A6478" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
          </svg>
          <input
            placeholder="Search by title or company..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="jobs-sector-filters">
          <button className={`jobs-chip ${activeSector === 'All' ? 'active' : ''}`} onClick={() => setActiveSector('All')}>All</button>
          {SECTORS.map(s => (
            <button key={s.value} className={`jobs-chip ${activeSector === s.label ? 'active' : ''}`} onClick={() => setActiveSector(s.label)}>{s.label}</button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="jobs-empty">Loading roles…</div>
      ) : filteredJobs.length === 0 ? (
        <div className="jobs-empty">No roles match these filters.</div>
      ) : (
        <div className="jobs-list">
          {filteredJobs.map(job => {
            const theme = sectorTheme(job.sector)
            return (
              <div key={job.id} className="job-card" onClick={() => navigate(`/jobs/${job.id}`)}>
                <div className="job-card-top">
                  <div className="job-card-sector" style={{ color: theme.cardColor }}>{sectorLabel(job.sector).toUpperCase()}</div>
                  <div className="job-card-time">{timeAgo(job.created_at)}</div>
                </div>
                <div className="job-card-title">{job.title}</div>
                <div className="job-card-company">{job.company?.display_name || 'Unknown Company'}</div>
                <div className="job-card-meta">
                  {job.location && <span>{job.location}</span>}
                  <span>·</span>
                  <span>{jobTypeLabel(job.job_type)}</span>
                  {experienceLabel(job.experience_level) && <><span>·</span><span>{experienceLabel(job.experience_level)}</span></>}
                  {job.salary_range && <><span>·</span><span className="job-card-salary">{job.salary_range}</span></>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {usingFallback && (
        <div className="jobs-demo-note">
          Demo mode — sample data shown for illustration. All scenarios are fictional.
        </div>
      )}
    </div>
  )
}

// =============================================================================
// Detail
// =============================================================================
function JobDetail({ user, jobId }) {
  const navigate = useNavigate()
  const [job, setJob] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [hasApplied, setHasApplied] = useState(false)
  const [showApply, setShowApply] = useState(false)
  const [coverNote, setCoverNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const isSample = jobId?.startsWith('sample-')

  useEffect(() => {
    let active = true
    setLoading(true)
    setNotFound(false)
    setHasApplied(false)
    setShowApply(false)
    setCoverNote('')

    const load = async () => {
      if (isSample) {
        const sample = FALLBACK_JOBS.find(j => j.id === jobId)
        if (active) {
          if (sample) setJob(sample)
          else setNotFound(true)
          setLoading(false)
        }
        return
      }

      const [{ data: row, error }, { data: existingApp }] = await Promise.all([
        supabase
          .from('jobs')
          .select('id, title, description, location, sector, job_type, experience_level, salary_range, created_at, is_active, company:profiles!company_id(id, display_name, sector, headline)')
          .eq('id', jobId)
          .maybeSingle(),
        supabase
          .from('job_applications')
          .select('id')
          .eq('job_id', jobId)
          .eq('applicant_id', user.id)
          .maybeSingle(),
      ])

      if (!active) return
      if (error || !row) {
        setNotFound(true)
        setLoading(false)
        return
      }
      setJob(adaptJob(row))
      setHasApplied(!!existingApp)
      setLoading(false)
    }

    load()
    return () => { active = false }
  }, [jobId, user.id, isSample])

  const submitApplication = async () => {
    if (submitting || isSample) return
    setSubmitting(true)
    const { error } = await supabase.from('job_applications').insert({
      job_id: jobId,
      applicant_id: user.id,
      cover_note: coverNote.trim() || null,
    })
    setSubmitting(false)
    if (error) { alert(error.message); return }
    setHasApplied(true)
    setShowApply(false)
    setCoverNote('')
  }

  if (loading) return <div className="placeholder-page"><p>Loading role…</p></div>
  if (notFound || !job) {
    return (
      <div className="placeholder-page">
        <h2>Role not found</h2>
        <p><button className="jobs-cancel" onClick={() => navigate('/jobs')}>Back to all jobs</button></p>
      </div>
    )
  }

  const theme = sectorTheme(job.sector)

  return (
    <div className="job-detail">
      <button className="jobs-back" onClick={() => navigate('/jobs')}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
        All Jobs
      </button>

      <div className="job-detail-header">
        <div className="job-detail-sector" style={{ color: theme.cardColor }}>{sectorLabel(job.sector).toUpperCase()}</div>
        <h1 className="job-detail-title">{job.title}</h1>
        <div className="job-detail-company">
          {job.company?.id ? (
            <Link to={`/profile/${job.company.id}`}>{job.company.display_name}</Link>
          ) : (
            <span>{job.company?.display_name || 'Unknown Company'}</span>
          )}
        </div>
        <div className="job-detail-meta">
          {job.location && <span>{job.location}</span>}
          {job.location && <span>·</span>}
          <span>{jobTypeLabel(job.job_type)}</span>
          {experienceLabel(job.experience_level) && <><span>·</span><span>{experienceLabel(job.experience_level)}</span></>}
          {job.salary_range && <><span>·</span><span className="job-detail-salary">{job.salary_range}</span></>}
          <span>·</span>
          <span>Posted {timeAgo(job.created_at)}</span>
        </div>
      </div>

      <div className="job-detail-body">
        {job.description.split(/\n\n+/).map((para, i) => (
          <p key={i}>{para}</p>
        ))}
      </div>

      {showApply && !hasApplied && !isSample && (
        <div className="job-apply-form">
          <h3>Apply to this role</h3>
          <textarea
            placeholder="Optional: add a brief note to the hiring team."
            value={coverNote}
            onChange={e => setCoverNote(e.target.value)}
            rows={5}
          />
          <div className="job-apply-actions">
            <button className="jobs-cancel" onClick={() => setShowApply(false)}>Cancel</button>
            <button className="jobs-submit big" onClick={submitApplication} disabled={submitting}>
              {submitting ? 'Submitting…' : 'Submit Application'}
            </button>
          </div>
        </div>
      )}

      {hasApplied && (
        <div className="job-apply-confirmation">Application submitted!</div>
      )}

      {!hasApplied && !showApply && (
        <button
          className="job-apply-btn"
          onClick={() => isSample ? alert('This is a sample listing. Real jobs become applicable once they\'re posted.') : setShowApply(true)}
          disabled={isSample}
        >
          {isSample ? 'Sample Listing' : 'Apply Now'}
        </button>
      )}
      {hasApplied && (
        <button className="job-apply-btn" disabled>Applied</button>
      )}
    </div>
  )
}

// =============================================================================
// Router
// =============================================================================
function Jobs({ user }) {
  const { id } = useParams()
  return id ? <JobDetail user={user} jobId={id} /> : <JobList user={user} />
}

export default Jobs
