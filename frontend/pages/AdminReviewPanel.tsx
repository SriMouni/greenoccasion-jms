import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle, Clock, FileText, MessageSquare, Shield, XCircle } from 'lucide-react';

export const AdminReviewPanel = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'queue' | 'comments' | 'history'>('queue');
  const [pendingPapers, setPendingPapers] = useState<any[]>([]);
  const [pendingComments, setPendingComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPending = () => {
    setLoading(true);
    fetch('/api/admin/pending')
      .then(async res => {
        if (res.status === 401 || res.status === 403) {
          navigate('/admin/login', { replace: true });
          return [];
        }
        return res.json();
      })
      .then(data => {
        setPendingPapers(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch pending papers', err);
        setLoading(false);
      });
  };

  const fetchPendingComments = () => {
    setLoading(true);
    fetch('/api/admin/comments/pending')
      .then(async res => {
        if (res.status === 401 || res.status === 403) {
          navigate('/admin/login', { replace: true });
          return [];
        }
        return res.json();
      })
      .then(data => {
        setPendingComments(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch pending comments', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    if (activeTab === 'queue') {
      fetchPending();
      return;
    }

    if (activeTab === 'comments') {
      fetchPendingComments();
    }
  }, [activeTab]);

  const handleReview = async (id: string, action: 'approved' | 'rejected') => {
    try {
      const res = await fetch('/api/admin/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paperId: id, status: action }),
      });

      if (res.status === 401 || res.status === 403) {
        navigate('/admin/login', { replace: true });
        return;
      }

      if (!res.ok) throw new Error('Review failed');

      setPendingPapers(prev => prev.filter(paper => paper.id !== id));
    } catch (err) {
      console.error(err);
      alert('Action failed.');
    }
  };

  const handleCommentModeration = async (id: string, action: 'approved' | 'rejected') => {
    try {
      const note = window.prompt(
        action === 'rejected' ? 'Enter moderation reason (required for rejection):' : 'Optional moderation note:',
        ''
      );

      if (action === 'rejected' && (!note || !note.trim())) {
        alert('Rejection reason is required.');
        return;
      }

      const res = await fetch(`/api/admin/comments/${id}/moderate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note: note?.trim() || null }),
      });

      if (res.status === 401 || res.status === 403) {
        navigate('/admin/login', { replace: true });
        return;
      }

      if (!res.ok) throw new Error('Moderation failed');

      setPendingComments(prev => prev.filter(comment => comment.id !== id));
    } catch (err) {
      console.error(err);
      alert('Moderation action failed.');
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } finally {
      navigate('/admin/login', { replace: true });
    }
  };

  return (
    <div className="pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[black] font-bold">
            <Shield className="w-6 h-6" />
            <span>Admin Review Panel</span>
          </div>
          <h1 className="text-4xl font-bold text-[black]">Submission Management</h1>
        </div>

        <div className="flex flex-wrap gap-2 items-center">
          <Link
            to="/admin/collection"
            className="inline-flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] font-semibold border border-primary/20 px-3 py-2 rounded-lg hover:bg-primary hover:text-neutral transition-colors"
          >
            Collection
            <ArrowRight className="w-4 h-4" />
          </Link>

          <button
            onClick={handleLogout}
            className="text-[10px] uppercase tracking-[0.16em] font-semibold border border-primary/20 px-3 py-2 rounded-lg hover:bg-primary hover:text-neutral transition-colors"
          >
            Sign Out
          </button>
        </div>
      </div>

      <div className="flex gap-2 bg-white p-1 rounded-xl border border-gray-200 mb-8 w-fit">
        {(['queue', 'comments', 'history'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
              activeTab === tab ? 'bg-[black] text-white shadow-sm' : 'text-muted hover:bg-neutral'
            }`}
          >
            {tab === 'queue' ? 'Review Queue' : tab === 'comments' ? 'Comments' : 'Review History'}
          </button>
        ))}
      </div>

      {activeTab === 'queue' ? (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#F8F9FA] border-b border-gray-200">
                  <th className="px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Paper Title</th>
                  <th className="px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Author</th>
                  <th className="px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Submission Date</th>
                  <th className="px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-muted font-serif italic text-xl">Loading queue...</td>
                  </tr>
                ) : pendingPapers.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-muted font-serif italic text-xl">No pending papers for review.</td>
                  </tr>
                ) : (
                  pendingPapers.map(paper => (
                    <tr key={paper.id} className="hover:bg-[black]/5 transition-colors">
                      <td className="px-6 py-6">
                        <p className="font-bold text-[black] line-clamp-1">{paper.title}</p>
                        <p className="text-xs text-[gray-800]">{paper.topic}</p>
                      </td>
                      <td className="px-6 py-6">
                        <p className="text-sm font-medium text-[black]">{paper.author_names || paper.author_name || 'Unknown'}</p>
                      </td>
                      <td className="px-6 py-6">
                        <p className="text-sm text-muted">{new Date(paper.created_at).toLocaleDateString()}</p>
                      </td>
                      <td className="px-6 py-6">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-800">
                          <Clock className="w-3 h-3" /> Pending
                        </span>
                      </td>
                      <td className="px-6 py-6 text-right">
                        <div className="flex justify-end gap-2">
                          <a href={`/uploads/${paper.file_path}`} target="_blank" rel="noopener noreferrer" className="p-2 text-muted hover:text-[black] transition-colors" title="View PDF">
                            <FileText className="w-5 h-5" />
                          </a>
                          <button onClick={() => handleReview(paper.id, 'approved')} className="p-2 text-muted hover:text-green-600 transition-colors" title="Approve">
                            <CheckCircle className="w-5 h-5" />
                          </button>
                          <button onClick={() => handleReview(paper.id, 'rejected')} className="p-2 text-muted hover:text-red-600 transition-colors" title="Reject">
                            <XCircle className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : activeTab === 'comments' ? (
        <div className="glass-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-[#F8F9FA] border-b border-gray-200">
                  <th className="px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Paper</th>
                  <th className="px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Commenter</th>
                  <th className="px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Comment</th>
                  <th className="px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading ? (
                  <tr>
                    <td colSpan={4} className="text-center py-10 text-muted font-serif italic text-xl">Loading comments...</td>
                  </tr>
                ) : pendingComments.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-10 text-muted font-serif italic text-xl">No pending comments.</td>
                  </tr>
                ) : (
                  pendingComments.map(comment => (
                    <tr key={comment.id} className="hover:bg-[black]/5 transition-colors">
                      <td className="px-6 py-6 max-w-72">
                        <p className="font-bold text-[black] line-clamp-2">{comment.title}</p>
                        <p className="text-xs text-muted mt-1">{new Date(comment.created_at).toLocaleDateString()}</p>
                      </td>
                      <td className="px-6 py-6">
                        <p className="text-sm font-medium text-[black]">{comment.commenter_name}</p>
                      </td>
                      <td className="px-6 py-6 max-w-xl">
                        <p className="text-sm text-muted line-clamp-4 whitespace-pre-wrap">{comment.body}</p>
                      </td>
                      <td className="px-6 py-6 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => handleCommentModeration(comment.id, 'approved')} className="p-2 text-muted hover:text-green-600 transition-colors" title="Approve comment">
                            <CheckCircle className="w-5 h-5" />
                          </button>
                          <button onClick={() => handleCommentModeration(comment.id, 'rejected')} className="p-2 text-muted hover:text-red-600 transition-colors" title="Reject comment">
                            <XCircle className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="glass-card p-20 text-center space-y-4">
          <Clock className="w-12 h-12 text-muted mx-auto opacity-20" />
          <h3 className="text-xl font-bold text-[black]">No review history module</h3>
          <p className="text-muted">History module is not yet integrated with the backend.</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-12">
        <div className="glass-card p-8 space-y-2">
          <p className="text-3xl font-bold text-[black]">{activeTab === 'comments' ? pendingComments.length : pendingPapers.length}</p>
          <p className="text-sm font-bold text-muted uppercase tracking-wider">In Queue</p>
        </div>
        <div className="glass-card p-8 space-y-2 opacity-50">
          <p className="text-3xl font-bold text-[gray-800]">--</p>
          <p className="text-sm font-bold text-muted uppercase tracking-wider">Approved This Month</p>
        </div>
        <div className="glass-card p-8 space-y-2 opacity-50">
          <p className="text-3xl font-bold text-[black]">-- Days</p>
          <p className="text-sm font-bold text-muted uppercase tracking-wider">Avg. Review Time</p>
        </div>
      </div>
    </div>
  );
};