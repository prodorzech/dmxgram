import React, { useState } from 'react';
import { Flag, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import './ReportModal.css';

interface ReportModalProps {
  senderUsername: string;
  onClose: () => void;
  onSubmit: (category: string, reason: string) => void;
}

const CATEGORIES = [
  { value: 'spam', labelKey: 'report.catSpam' },
  { value: 'harassment', labelKey: 'report.catHarassment' },
  { value: 'inappropriate', labelKey: 'report.catInappropriate' },
  { value: 'misinformation', labelKey: 'report.catMisinformation' },
  { value: 'other', labelKey: 'report.catOther' },
];

export const ReportModal: React.FC<ReportModalProps> = ({ senderUsername, onClose, onSubmit }) => {
  const { t } = useTranslation();
  const [category, setCategory] = useState('spam');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const isValid = reason.trim().length >= 10;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || submitting) return;
    setSubmitting(true);
    await onSubmit(category, reason.trim());
    setSubmitting(false);
  };

  return (
    <div className="report-modal-overlay" onMouseDown={onClose}>
      <div className="report-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="report-modal-header">
          <Flag size={18} />
          <h3>{t('report.title')}</h3>
          <button className="report-modal-close" onClick={onClose} title={t('user.cancel')}>
            <X size={18} />
          </button>
        </div>

        <p className="report-modal-sub">{t('report.subtitle', { username: senderUsername })}</p>

        <form onSubmit={handleSubmit} className="report-modal-form">
          <label className="report-label">{t('report.category')}</label>
          <select
            className="report-select"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {t(c.labelKey)}
              </option>
            ))}
          </select>

          <label className="report-label">{t('report.reason')}</label>
          <textarea
            className="report-textarea"
            placeholder={t('report.reasonPlaceholder')}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            maxLength={500}
          />
          {reason.trim().length > 0 && reason.trim().length < 10 && (
            <span className="report-hint">{t('report.reasonTooShort')}</span>
          )}

          <div className="report-modal-actions">
            <button type="button" className="report-btn-cancel" onClick={onClose}>
              {t('user.cancel')}
            </button>
            <button type="submit" className="report-btn-submit" disabled={!isValid || submitting}>
              {submitting ? t('report.submitting') : t('report.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
