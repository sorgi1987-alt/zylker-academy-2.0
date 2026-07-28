import React from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { usePagedList } from '../useApi.js';
import { api } from '../api.js';
import {
  Async, Card, Pill, Pagination, SearchBox, FilterSelect, SourceBadge, ReadOnlyBadge
} from '../components/Ui.jsx';

/**
 * Course catalogue.
 *
 * Every CRM programme appears whether or not Zoho Learn has a record for it, and
 * Learn courses with no CRM programme appear too. That way the catalogue is
 * complete when Learn is unavailable, and a course that exists only in Learn is
 * visible rather than quietly missing. Fields that could not be loaded are
 * labelled as unavailable rather than shown as blank.
 */
export default function Courses() {
  const [params] = useSearchParams();
  const list = usePagedList(api.courses, {
    initialFilters: { published: params.get('published') || undefined }
  });

  return (
    <>
      <div className="page-head">
        <h1>Course catalogue</h1>
        <p>
          Programmes from Zoho CRM matched to their Zoho Learn courses.
          Zoho Learn is read-only in this application.
        </p>
      </div>

      <Card
        title="Courses and programmes"
        action={(
          <div className="head-actions">
            <SourceBadge source="learn" />
            <ReadOnlyBadge system="Zoho Learn" />
          </div>
        )}
      >
        <div className="toolbar">
          <SearchBox
            id="course-search"
            label="Search"
            value={list.search}
            onChange={list.setSearch}
            placeholder="Course or programme name"
          />
          <FilterSelect
            id="course-published"
            label="Publication"
            value={list.filters.published || ''}
            onChange={(v) => list.setFilter('published', v)}
            options={[{ value: 'true', label: 'Published only' }]}
            allLabel="All"
          />
        </div>

        <Async state={list} empty={{ title: 'No courses match' }}>
          {(rows, meta) => (
            <>
              {meta.learnNote && <p className="note">{meta.learnNote}</p>}

              <div className="card-grid">
                {rows.map((c) => (
                  <article className="course-card" key={`${c.source}-${c.id || c.programme?.id}`}>
                    <header>
                      <h3>{c.name}</h3>
                      <div className="head-actions">
                        <SourceBadge source={c.source} />
                        {c.match.inferred && (
                          <span className="pill warn" title="Matched on course name, not on an identifier">
                            Inferred
                          </span>
                        )}
                      </div>
                    </header>

                    <p className="muted">
                      {c.description || (
                        c.source === 'crm'
                          ? <em>Description is held in Zoho Learn and is not available.</em>
                          : 'No description.'
                      )}
                    </p>

                    <dl className="dl compact">
                      <dt>Publication status</dt>
                      <dd>
                        {c.published === null
                          ? <span className="muted">Not available</span>
                          : <Pill value={c.published ? 'Published' : 'Not published'} />}
                      </dd>
                      <dt>Lessons</dt>
                      <dd className="mono">
                        {c.lessonCount === null || c.lessonCount === undefined
                          ? <span className="muted">Not available</span>
                          : c.lessonCount}
                      </dd>
                      <dt>Programme</dt>
                      <dd>
                        {c.programme
                          ? <Link to={`/programmes/${c.programme.id}`}>{c.programme.name}</Link>
                          : <span className="muted">No CRM programme mapped</span>}
                      </dd>
                      <dt>Enrolments in CRM</dt>
                      <dd className="mono">{c.crmEnrolments}</dd>
                    </dl>

                    {c.url && (
                      <a className="btn" href={c.url} target="_blank" rel="noreferrer noopener">
                        Open in Zoho Learn
                      </a>
                    )}
                  </article>
                ))}
              </div>

              <Pagination
                page={meta.page}
                totalPages={meta.totalPages}
                total={meta.total}
                onPage={list.setPage}
                busy={list.status === 'loading'}
              />
            </>
          )}
        </Async>
      </Card>
    </>
  );
}
