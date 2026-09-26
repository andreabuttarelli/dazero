export const ERROR_COPY = {
  notFound: { title: 'error.notFound.title', body: 'error.notFound.body' },
  denied: { title: 'error.denied.title', body: 'error.denied.body' },
  generic: { title: 'error.generic.title', body: 'error.generic.body' }
} as const;

export type ErrorCopy = (typeof ERROR_COPY)[keyof typeof ERROR_COPY];

const DENIED_STATUSES = new Set([401, 403]);
const NOT_FOUND_STATUS = 404;

export function errorCopyFor(status: number): ErrorCopy {
  if (status === NOT_FOUND_STATUS) {
    return ERROR_COPY.notFound;
  }
  if (DENIED_STATUSES.has(status)) {
    return ERROR_COPY.denied;
  }
  return ERROR_COPY.generic;
}
