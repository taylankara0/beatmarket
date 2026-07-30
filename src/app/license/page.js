import LegalPage, {
  LegalSection,
} from '@/components/LegalPage';

export const metadata = {
  title: 'Beat License',
  description:
    'General licensing rules for beats purchased through BeatMarket.',
};

export default function LicensePage() {
  return (
    <LegalPage
      title="Beat License"
      lastUpdated="July 30, 2026"
    >
      <p
        style={{
          margin: 0,
          color: '#374151',
        }}
      >
        This Beat License describes the
        general rights and restrictions that
        apply when a buyer purchases a beat
        through BeatMarket.
      </p>

      <p
        style={{
          margin: '18px 0 0',
          color: '#374151',
        }}
      >
        The specific license selected during
        checkout controls the permitted use of
        the purchased beat. Where an order,
        listing, or separately supplied
        license contains more specific terms,
        those specific terms take priority
        over this general policy.
      </p>

      <LegalSection title="1. Parties">
        <p style={{ margin: 0 }}>
          The producer who owns or controls the
          beat is the licensor. The buyer who
          completes the purchase is the
          licensee.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          BeatMarket provides the marketplace,
          payment, delivery, and recordkeeping
          technology but does not become the
          copyright owner of the beat merely
          because it is listed or sold through
          the platform.
        </p>
      </LegalSection>

      <LegalSection title="2. License activation">
        <p style={{ margin: 0 }}>
          A license becomes effective only
          after:
        </p>

        <ul
          style={{
            margin: '12px 0 0',
            paddingLeft: '24px',
          }}
        >
          <li>
            payment has been successfully
            completed;
          </li>

          <li>
            BeatMarket has recorded the order
            as paid;
          </li>

          <li>
            the buyer complies with the
            applicable purchase and license
            terms.
          </li>
        </ul>

        <p style={{ margin: '14px 0 0' }}>
          A pending, failed, cancelled,
          refunded, reversed, disputed, or
          fraudulent transaction does not
          create or preserve a valid license.
        </p>
      </LegalSection>

      <LegalSection title="3. Ownership">
        <p style={{ margin: 0 }}>
          Unless an Exclusive license expressly
          states otherwise, the producer
          retains all copyright and ownership
          rights in the beat, composition,
          recording, stems, project files, and
          related material.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          Purchasing a license does not mean
          that the buyer purchased the
          producer&apos;s copyright, publishing
          rights, trademarks, name, likeness,
          or other intellectual property.
        </p>
      </LegalSection>

      <LegalSection title="4. Non-exclusive licenses">
        <p style={{ margin: 0 }}>
          A Non-Exclusive license grants the
          buyer a limited, non-transferable,
          non-sublicensable right to use the
          beat according to the license terms
          shown at the time of purchase.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          The producer may continue licensing
          the same beat to other buyers unless
          and until an Exclusive license is
          validly completed.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          Existing Non-Exclusive licenses are
          not automatically cancelled when a
          later buyer purchases an Exclusive
          license, unless the applicable
          license expressly provides
          otherwise.
        </p>
      </LegalSection>

      <LegalSection title="5. Exclusive licenses">
        <p style={{ margin: 0 }}>
          An Exclusive license grants the buyer
          the exclusive rights described in
          the applicable purchase terms after
          payment is completed and confirmed.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          An Exclusive license does not
          automatically transfer the
          producer&apos;s underlying copyright
          unless the license expressly states
          that copyright ownership is being
          assigned.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          Previously issued valid licenses may
          remain effective. The buyer accepts
          that earlier licensees may continue
          using the beat within the rights
          previously granted to them.
        </p>
      </LegalSection>

      <LegalSection title="6. Permitted use">
        <p style={{ margin: 0 }}>
          Subject to the applicable license,
          the buyer may generally use the beat
          to create one new musical work by
          adding original vocals, lyrics,
          instruments, arrangement, or other
          creative elements.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          Permitted uses may include:
        </p>

        <ul
          style={{
            margin: '12px 0 0',
            paddingLeft: '24px',
          }}
        >
          <li>
            recording and releasing a new
            song;
          </li>

          <li>
            distributing the new song through
            authorized music platforms;
          </li>

          <li>
            promoting the new song through
            social media and websites;
          </li>

          <li>
            performing the new song publicly;
          </li>

          <li>
            creating an official music video;
          </li>

          <li>
            monetizing the new song within any
            limits stated by the purchased
            license.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="7. License-specific limits">
        <p style={{ margin: 0 }}>
          A purchased license may contain
          limits concerning:
        </p>

        <ul
          style={{
            margin: '12px 0 0',
            paddingLeft: '24px',
          }}
        >
          <li>
            streams, downloads, sales, or
            physical copies;
          </li>

          <li>
            monetized video views;
          </li>

          <li>
            live performances;
          </li>

          <li>
            radio, television, film,
            advertising, games, or other
            synchronization uses;
          </li>

          <li>
            commercial revenue or audience
            size;
          </li>

          <li>
            permitted file formats and access
            to stems;
          </li>

          <li>
            the number of projects or songs
            that may use the beat.
          </li>
        </ul>

        <p style={{ margin: '14px 0 0' }}>
          The buyer must obtain an upgraded or
          additional license before exceeding
          any applicable limit.
        </p>
      </LegalSection>

      <LegalSection title="8. Producer credit">
        <p style={{ margin: 0 }}>
          Unless the applicable license states
          otherwise, the buyer must provide
          reasonable producer credit wherever
          credits are normally displayed.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          A suitable credit format is:
        </p>

        <p
          style={{
            margin: '14px 0 0',
            padding: '14px 16px',
            background: '#f3f4f6',
            borderRadius: '8px',
            color: '#171717',
            fontWeight: '600',
          }}
        >
          Produced by [Producer Name]
        </p>

        <p style={{ margin: '14px 0 0' }}>
          The buyer may not falsely claim that
          they created or produced the
          original beat.
        </p>
      </LegalSection>

      <LegalSection title="9. Prohibited uses">
        <p style={{ margin: 0 }}>
          Unless expressly authorized in
          writing, the buyer may not:
        </p>

        <ul
          style={{
            margin: '12px 0 0',
            paddingLeft: '24px',
          }}
        >
          <li>
            resell, redistribute, share, lease,
            or sublicense the beat as a
            standalone file;
          </li>

          <li>
            upload or distribute the beat in
            substantially the same form in
            which it was purchased;
          </li>

          <li>
            include the beat in another beat
            pack, sample pack, loop library,
            template, or stock-audio
            collection;
          </li>

          <li>
            give another artist, producer,
            label, or third party access to the
            license as though they were the
            buyer;
          </li>

          <li>
            use the beat for unlawful,
            defamatory, fraudulent, hateful,
            or deliberately harmful content;
          </li>

          <li>
            register the original beat itself
            as the buyer&apos;s exclusive
            copyright;
          </li>

          <li>
            interfere with the producer&apos;s
            ownership or valid rights granted
            to other licensees.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="10. Content identification systems">
        <p style={{ margin: 0 }}>
          The buyer must not register the
          original beat, instrumental, stems,
          or substantially unchanged audio in
          YouTube Content ID, Meta Rights
          Manager, TikTok identification
          systems, or similar automated
          rights-enforcement systems unless
          the applicable license expressly
          permits it.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          Unauthorized registration may cause
          false claims against the producer or
          other valid licensees and may result
          in suspension or termination of the
          license.
        </p>
      </LegalSection>

      <LegalSection title="11. Samples and third-party material">
        <p style={{ margin: 0 }}>
          Producers are responsible for
          disclosing known samples or
          third-party material where required.
          Buyers are responsible for obtaining
          any additional clearance required
          for their intended use.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          A BeatMarket purchase does not
          automatically clear third-party
          vocals, samples, compositions,
          performances, trademarks, or other
          material that the producer does not
          own or control.
        </p>
      </LegalSection>

      <LegalSection title="12. Collaborations and transfers">
        <p style={{ margin: 0 }}>
          The license is issued to the buyer
          identified by the order and may not
          be sold, assigned, or transferred
          without the producer&apos;s written
          permission.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          The buyer may work with artists,
          engineers, musicians, distributors,
          labels, and other service providers
          only to the extent reasonably
          necessary to create, release, and
          manage the licensed song.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          Those collaborators do not receive an
          independent right to reuse or
          redistribute the beat.
        </p>
      </LegalSection>

      <LegalSection title="13. Royalties and publishing">
        <p style={{ margin: 0 }}>
          Any royalty, publishing,
          performance-rights, mechanical,
          synchronization, master, or
          songwriting split must be determined
          by the specific license or a separate
          written agreement between the buyer
          and producer.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          BeatMarket does not determine or
          collect publishing splits unless a
          platform feature or written agreement
          expressly states otherwise.
        </p>
      </LegalSection>

      <LegalSection title="14. Refunds and license cancellation">
        <p style={{ margin: 0 }}>
          A completed refund, chargeback,
          payment reversal, fraudulent
          transaction, or cancelled order may
          terminate the associated license.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          After termination, the buyer must
          stop using, distributing,
          performing, monetizing, or licensing
          material that depends on the
          cancelled license, except where
          applicable law provides otherwise.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          Download access may also be revoked
          after a refund or payment reversal.
        </p>
      </LegalSection>

      <LegalSection title="15. Breach and termination">
        <p style={{ margin: 0 }}>
          A material violation of the license
          may result in suspension or
          termination of the buyer&apos;s
          rights.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          Depending on the violation, the
          producer may require the buyer to
          stop distribution, remove content,
          correct credits, obtain an upgraded
          license, compensate the rights
          holder, or take another action
          permitted by law.
        </p>
      </LegalSection>

      <LegalSection title="16. Producer warranties">
        <p style={{ margin: 0 }}>
          By listing a beat, the producer
          represents that they own or control
          the rights necessary to license it
          through BeatMarket.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          The producer is responsible for
          unauthorized samples, stolen
          content, false ownership claims, and
          undisclosed third-party restrictions
          associated with the beat.
        </p>
      </LegalSection>

      <LegalSection title="17. Buyer responsibilities">
        <p style={{ margin: 0 }}>
          The buyer is responsible for:
        </p>

        <ul
          style={{
            margin: '12px 0 0',
            paddingLeft: '24px',
          }}
        >
          <li>
            reviewing the license before
            purchase;
          </li>

          <li>
            keeping proof of purchase and
            license records;
          </li>

          <li>
            staying within applicable usage
            limits;
          </li>

          <li>
            providing required credits;
          </li>

          <li>
            securing additional clearances or
            permissions needed for the final
            song;
          </li>

          <li>
            complying with laws, platform
            rules, distributor requirements,
            and third-party rights.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="18. No guarantee of commercial success">
        <p style={{ margin: 0 }}>
          A license permits specified use of a
          beat but does not guarantee
          distribution approval, monetization,
          audience growth, commercial success,
          playlist placement, label interest,
          or acceptance by any third-party
          service.
        </p>
      </LegalSection>

      <LegalSection title="19. Disputes">
        <p style={{ margin: 0 }}>
          Licensing disputes should be
          reported promptly through
          BeatMarket&apos;s official support
          channel with the order identifier,
          beat information, license type, and
          relevant evidence.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          BeatMarket may preserve records,
          restrict access, pause payments,
          suspend content, or request
          additional information while a
          dispute is reviewed.
        </p>
      </LegalSection>

      <LegalSection title="20. Mandatory legal rights">
        <p style={{ margin: 0 }}>
          Nothing in this license removes or
          limits rights that cannot lawfully be
          excluded under applicable law.
        </p>
      </LegalSection>

      <LegalSection title="21. Contact">
        <p style={{ margin: 0 }}>
          Questions concerning a specific beat
          license should be submitted through
          BeatMarket&apos;s official support
          channel with the relevant order and
          listing information.
        </p>
      </LegalSection>
    </LegalPage>
  );
}