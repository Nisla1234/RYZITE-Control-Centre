import React from 'react';
import { CheckCircle2, Clock, XCircle, AlertCircle } from 'lucide-react';

interface StatusTextProps {
  status: 'published' | 'draft' | 'success' | 'failure' | 'warning' | 'connected' | 'disconnected';
  label?: string;
}

export function StatusText({ status, label }: StatusTextProps) {
  switch (status) {
    case 'published':
    case 'success':
    case 'connected':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#15803D] whitespace-nowrap">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          {label || (status === 'published' ? 'Published' : status === 'connected' ? 'Connected' : 'Success')}
        </span>
      );
    case 'draft':
    case 'warning':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#B45309] whitespace-nowrap">
          {status === 'draft' ? <Clock className="h-3.5 w-3.5 shrink-0" /> : <AlertCircle className="h-3.5 w-3.5 shrink-0" />}
          {label || (status === 'draft' ? 'Draft' : 'Warning')}
        </span>
      );
    case 'failure':
    case 'disconnected':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#B91C1C] whitespace-nowrap">
          <XCircle className="h-3.5 w-3.5 shrink-0" />
          {label || (status === 'failure' ? 'Failed' : 'Not Configured')}
        </span>
      );
  }
}
