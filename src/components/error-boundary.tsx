import { Component, type ErrorInfo, type ReactNode } from 'react';

import { useTranslation } from '@/i18n';
import { logError } from '@/lib/logger';

import { ErrorState } from './ui/states';

type Props = { children: ReactNode; onReset?: () => void };
type State = { error: Error | null };

function Fallback({ onReset }: { onReset: () => void }) {
  const t = useTranslation();
  return (
    <ErrorState
      icon="bug-outline"
      title={t('error.crashTitle')}
      body={t('error.crashBody')}
      action={{ label: t('error.reload'), onPress: onReset }}
      fullHeight
    />
  );
}

/**
 * Catches render-time crashes so a broken screen shows a recoverable state
 * instead of a blank white app. Wraps the whole navigator; individual screens
 * can nest their own.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logError('render_crash', error, { componentStack: info.componentStack ?? undefined });
  }

  private handleReset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.error) {
      return <Fallback onReset={this.handleReset} />;
    }
    return this.props.children;
  }
}
