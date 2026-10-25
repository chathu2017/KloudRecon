import * as React from 'react';
import { useSearchParams } from 'react-router-dom';

export const RESOURCE_PARAM = 'resource';

/** Open/close the drawer through the URL, so any page can link to a resource. */
export function useResourceParam(): [string | null, (armId: string | null) => void] {
  const [params, setParams] = useSearchParams();
  const armId = params.get(RESOURCE_PARAM);
  const set = React.useCallback(
    (next: string | null) => {
      setParams(
        (prev) => {
          const copy = new URLSearchParams(prev);
          if (next) copy.set(RESOURCE_PARAM, next);
          else copy.delete(RESOURCE_PARAM);
          return copy;
        },
        { replace: !next },
      );
    },
    [setParams],
  );
  return [armId, set];
}
