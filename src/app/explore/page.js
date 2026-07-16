'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-client';
import { useCart } from '@/context/CartContext';

export default function ExplorePage() {
  const [beats, setBeats] = useState([]);
  const [loading, setLoading] = useState(true);

  const supabase = createClient();
  const { addToCart } = useCart();

  useEffect(() => {
    async function fetchBeats() {
      const { data, error } = await supabase
        .from('beats')
        .select(`
          id,
          title,
          bpm,
          preview_url,
          profiles (
            username,
            display_name
          ),
          licenses (
            id,
            name,
            price
          )
        `)
        .order('created_at', {
          ascending: false
        });

      if (error) {
        console.error(
          'Error fetching beats:',
          error
        );
      } else {
        setBeats(data || []);
      }

      setLoading(false);
    }

    fetchBeats();
  }, []);

  function handleAddLicenseToCart(
    beat,
    license
  ) {
    addToCart({
      /*
        Use the beat and license IDs together so each
        license option has a unique cart item ID.
      */
      id: `${beat.id}-${license.id}`,

      beatId: beat.id,
      licenseId: license.id,

      title: beat.title,
      price: license.price,

      licenseName: license.name,
      licenseType: license.name,

      producer:
        beat.profiles?.username ||
        'Unknown'
    });
  }

  if (loading) {
    return (
      <div className="p-10 text-center text-white">
        Loading marketplace...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 p-8 text-white">
      <h1 className="mb-8 text-center text-4xl font-bold">
        Explore Beats
      </h1>

      {beats.length === 0 ? (
        <p className="text-center text-gray-400">
          No beats available yet. Be the first to upload!
        </p>
      ) : (
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {beats.map((beat) => {
            const basicLicense =
              beat.licenses?.find(
                (license) =>
                  license.name === 'Basic'
              );

            const exclusiveLicense =
              beat.licenses?.find(
                (license) =>
                  license.name === 'Exclusive'
              );

            return (
              <div
                key={beat.id}
                className="rounded-xl border border-gray-700 bg-gray-800 p-5 shadow-lg transition-colors hover:border-indigo-500"
              >
                <div className="mb-4 flex items-start justify-between">
                  <div className="min-w-0">
                    <h2 className="truncate text-xl font-bold">
                      {beat.title}
                    </h2>

                    <p className="text-sm text-gray-400">
                      by @
                      {beat.profiles?.username ||
                        'Unknown Producer'}
                    </p>
                  </div>

                  {beat.bpm && (
                    <span className="ml-3 shrink-0 rounded-full bg-gray-700 px-2 py-1 text-xs">
                      {beat.bpm} BPM
                    </span>
                  )}
                </div>

                <div className="mt-4 space-y-3">
                  {basicLicense && (
                    <button
                      type="button"
                      onClick={() =>
                        handleAddLicenseToCart(
                          beat,
                          basicLicense
                        )
                      }
                      className="flex w-full items-center justify-between rounded-lg bg-gray-700 p-3 transition hover:bg-gray-600"
                    >
                      <span className="text-sm font-medium">
                        Add Basic to Cart
                      </span>

                      <span className="font-bold text-indigo-400">
                        ${basicLicense.price}
                      </span>
                    </button>
                  )}

                  {exclusiveLicense && (
                    <button
                      type="button"
                      onClick={() =>
                        handleAddLicenseToCart(
                          beat,
                          exclusiveLicense
                        )
                      }
                      className="flex w-full items-center justify-between rounded-lg bg-gray-700 p-3 transition hover:bg-gray-600"
                    >
                      <span className="text-sm font-medium">
                        Add Exclusive to Cart
                      </span>

                      <span className="font-bold text-green-400">
                        ${exclusiveLicense.price}
                      </span>
                    </button>
                  )}
                </div>

                <div className="mt-4">
                  <button
                    type="button"
                    className="w-full rounded-lg bg-indigo-600 py-2 font-medium text-white transition hover:bg-indigo-700"
                  >
                    Play Preview
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}