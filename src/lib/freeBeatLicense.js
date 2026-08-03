export const FREE_BEAT_LICENSE_VERSION =
  'free-noncommercial-v1';

export const FREE_BEAT_LICENSE_NAME =
  'BeatMarket Free Beat License — Non-Commercial';

export const FREE_BEAT_LICENSE_SUMMARY =
  'Free for non-commercial use only. Producer credit is required. Monetization, resale, redistribution, and ownership claims are prohibited.';

export const FREE_BEAT_LICENSE_TERMS = [
  {
    title: 'Non-exclusive permission',
    text:
      'The producer grants the downloader a non-exclusive right to use the beat in personal and non-commercial creative projects.',
  },
  {
    title: 'Producer credit required',
    text:
      'The downloader must credit the producer wherever practical, using a credit such as “Prod. by [Producer Name]”.',
  },
  {
    title: 'No monetization',
    text:
      'The beat may not be used in monetized videos, paid releases, advertising, sponsored content, paid performances, commercial synchronization, or any other revenue-generating activity.',
  },
  {
    title: 'No resale or redistribution',
    text:
      'The downloader may not sell, license, sublicense, share, upload, distribute, or make the beat available as a standalone audio file.',
  },
  {
    title: 'No ownership claims',
    text:
      'The downloader may not claim ownership of the beat, register it with Content ID, or interfere with the producer’s ownership or rights.',
  },
  {
    title: 'Producer keeps ownership',
    text:
      'The producer retains all ownership and intellectual-property rights in the beat.',
  },
  {
    title: 'Previously granted use',
    text:
      'Disabling future downloads does not cancel permission already granted to a downloader, provided that downloader continues to follow this license version.',
  },
];

export function isAcceptedFreeBeatLicenseVersion(
  value
) {
  return (
    typeof value === 'string' &&
    value ===
      FREE_BEAT_LICENSE_VERSION
  );
}