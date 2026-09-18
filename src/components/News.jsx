import { getNews } from '../api.js'
import { normalizeNews } from '../news.js'
import { useAsync } from '../useAsync.js'
import { SpoilerGate } from '../FanContext.jsx'
import { Async, Panel } from './ui.jsx'
import '../news.css'

const publishedDate = new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago', timeZoneName: 'short',
})

export function News({ team }) {
  return <Panel title={`${team.short} news`} aside="Latest reporting" note="Current headlines, regardless of the season selected above. Stories open on ESPN; some may require a subscription.">
    <SpoilerGate scope={`news:${team.key}`} label="news headlines (may include results)">
      <NewsFeed team={team} />
    </SpoilerGate>
  </Panel>
}

function NewsFeed({ team }) {
  const state = useAsync(async ({ fresh }) => normalizeNews(await getNews(team, { fresh }), team), [team.key])
  return <>
    <div className="news-toolbar"><span>ESPN · Team coverage</span><button className="pixel-button" onClick={state.refresh} disabled={state.loading}>Refresh news</button></div>
    {state.refreshError ? <p className="note" role="status">News could not refresh. Showing the last successful update.</p> : null}
    <Async state={state} what="the news" rows={3} isEmpty={stories => !stories?.length} empty="No recent stories tagged for this team are available. Try another team or refresh later.">
      {stories => <div className="news-grid">{stories.map(story => <article className="news-card" key={story.id}>
        {story.image ? <img src={story.image} alt="" loading="lazy" onError={event => { event.currentTarget.hidden = true }} /> : <div className="news-wordmark" aria-hidden="true">{team.abbr}<span>THE LATEST</span></div>}
        <div className="news-copy">
          <div className="news-kicker">ESPN{story.kind ? ` · ${story.kind}` : ''}</div>
          <h3><a href={story.url} target="_blank" rel="noopener noreferrer">{story.title}<span className="sr-only"> (opens on ESPN in a new tab)</span></a></h3>
          {story.byline ? <p>{story.byline}</p> : null}
          {story.published ? <time dateTime={story.published}>{publishedDate.format(new Date(story.published))}</time> : <span className="news-date">Publication date unavailable</span>}
        </div>
      </article>)}</div>}
    </Async>
  </>
}
