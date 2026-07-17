'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase-client';
import { useCart } from '@/context/CartContext';

export default function ExplorePage() {
  const [beats, setBeats] = useState([]);
  const [loading, setLoading] = useState(true);

  const { addToCart } = useCart();

  useEffect(() => {
    async function fetchBeats() {
      const supabase = createClient();

      const { data, error } = await supabase
        .from('beats')
        .select(`
          id,
          title,
          bpm,
          preview_url,
          is_sold_exclusive,
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
    /*
      A beat sold through an Exclusive license cannot
      be added to the cart under any license type.
    */
    if (beat.is_sold_exclusive) {
      return;
    }

    addToCart({
      /*
        Use the beat and license IDs together so each
        license option has a unique cart item ID.
      */
      id:
        `${beat.id}-${license.id}`,

      beatId:
        beat.id,

      licenseId:
        license.id,

      title:
        beat.title,

      price:
        license.price,

      licenseName:
        license.name,

      licenseType:
        license.name,

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
                  license.name ===
                  'Exclusive'
              );

            const isSoldExclusive =
              Boolean(
                beat.is_sold_exclusive
              );

            return (
              <div
                key={beat.id}
                className={`rounded-xl border bg-gray-800 p-5 shadow-lg transition-colors ${
                  isSoldExclusive
                    ? 'border-red-900 opacity-75'
                    : 'border-gray-700 hover:border-indigo-500'
                }`}
              >
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-xl font-bold">
                      {beat.title}
                    </h2>

                    <p className="text-sm text-gray-400">
                      by @
                      {beat.profiles
                        ?.username ||
                        'Unknown Producer'}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    {beat.bpm && (
                      <span className="rounded-full bg-gray-700 px-2 py-1 text-xs">
                        {beat.bpm} BPM
                      </span>
                    )}

                    {isSoldExclusive && (
                      <span className="rounded-full bg-red-900 px-2 py-1 text-xs font-semibold text-red-200">
                        Sold Exclusive
                      </span>
                    )}
                  </div>
                </div>

                {isSoldExclusive ? (
                  <div className="mt-4 rounded-lg border border-red-900 bg-red-950/40 p-4 text-center">
                    <p className="font-semibold text-red-300">
                      No longer available
                    </p>

                    <p className="mt-1 text-xs text-red-200/70">
                      This beat has been sold
                      through an Exclusive
                      license.
                    </p>
                  </div>
                ) : (
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
                          $
                          {
                            exclusiveLicense.price
                          }
                        </span>
                      </button>
                    )}
                  </div>
                )}

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