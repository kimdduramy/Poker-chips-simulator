import { useState } from 'react';
import { APP_NAME, roomUrl } from '../lib/format';
import { Icon } from './Icon';
import { Qr } from './Qr';
import { toast } from './Toast';

export function Invite({ code, qrSize = 176 }: { code: string; qrSize?: number }) {
  const url = roomUrl(code);
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator.share === 'function';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast(url);
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title: `${APP_NAME} 테이블 ${code}`, text: `포커 테이블에 들어와: ${code}`, url });
    } catch {
      // dismissed
    }
  };

  return (
    <div className="invite">
      <div className="invite-code">
        <span className="big-code">
          <span className="sr-only">테이블 코드 {code.split('').join(' ')}</span>
          <span aria-hidden="true">{code}</span>
        </span>
        <span className="muted invite-url mono">{url.replace(/^https?:\/\//, '')}</span>
      </div>
      <Qr value={url} size={qrSize} label={`${code} 테이블 참가 QR 코드`} />
      <div className="invite-actions">
        {canShare && (
          <button className="btn btn-quiet btn-md" onClick={share}>
            <Icon name="share" size={18} /> 공유
          </button>
        )}
        <button className="btn btn-quiet btn-md" onClick={copy}>
          <Icon name={copied ? 'check' : 'copy'} size={18} /> {copied ? '복사됨' : '링크 복사'}
        </button>
      </div>
    </div>
  );
}
