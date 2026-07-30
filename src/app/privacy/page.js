import LegalPage, {
  LegalSection,
} from '@/components/LegalPage';

export const metadata = {
  title: 'Privacy Policy',
  description:
    'How BeatMarket collects, uses, stores, and protects personal information.',
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      lastUpdated="July 30, 2026"
    >
      <p
        style={{
          margin: 0,
          color: '#374151',
        }}
      >
        This Privacy Policy explains how
        BeatMarket collects, uses, stores,
        shares, and protects information when
        you visit the marketplace, create an
        account, upload or purchase beats,
        request payouts, receive emails, or
        otherwise use the service.
      </p>

      <p
        style={{
          margin: '18px 0 0',
          color: '#374151',
        }}
      >
        By using BeatMarket, you acknowledge
        the data practices described in this
        Policy.
      </p>

      <LegalSection title="1. Information we collect">
        <p style={{ margin: 0 }}>
          The information collected depends
          on how you use BeatMarket.
        </p>

        <h3
          style={{
            margin: '22px 0 10px',
            fontSize: '1.05rem',
            color: '#171717',
          }}
        >
          Account information
        </h3>

        <p style={{ margin: 0 }}>
          When you register or manage an
          account, BeatMarket may collect:
        </p>

        <ul
          style={{
            margin: '12px 0 0',
            paddingLeft: '24px',
          }}
        >
          <li>email address;</li>
          <li>
            username, display name, and
            producer status;
          </li>
          <li>
            authentication and account
            identifiers;
          </li>
          <li>
            account settings and profile
            information.
          </li>
        </ul>

        <h3
          style={{
            margin: '22px 0 10px',
            fontSize: '1.05rem',
            color: '#171717',
          }}
        >
          Marketplace information
        </h3>

        <p style={{ margin: 0 }}>
          When you buy, sell, upload, publish,
          download, or manage beats,
          BeatMarket may collect:
        </p>

        <ul
          style={{
            margin: '12px 0 0',
            paddingLeft: '24px',
          }}
        >
          <li>
            beat titles, descriptions, prices,
            genres, moods, and licensing
            options;
          </li>
          <li>
            uploaded audio, artwork, stems,
            archives, and related files;
          </li>
          <li>
            purchase, order, refund, download,
            earnings, and payout records;
          </li>
          <li>
            producer and buyer identifiers
            connected to marketplace activity;
          </li>
          <li>
            administrative notes and
            transaction status information.
          </li>
        </ul>

        <h3
          style={{
            margin: '22px 0 10px',
            fontSize: '1.05rem',
            color: '#171717',
          }}
        >
          Payment information
        </h3>

        <p style={{ margin: 0 }}>
          Payments are processed through a
          third-party payment provider.
          BeatMarket may receive transaction
          identifiers, payment status,
          currency, amounts, failure reasons,
          refund information, and limited
          payment metadata.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          BeatMarket does not intend to store
          complete payment-card numbers,
          security codes, or other full card
          credentials entered directly on the
          payment provider&apos;s secure
          payment interface.
        </p>

        <h3
          style={{
            margin: '22px 0 10px',
            fontSize: '1.05rem',
            color: '#171717',
          }}
        >
          Payout information
        </h3>

        <p style={{ margin: 0 }}>
          Producers requesting payouts may
          provide payout-account details,
          account-holder information,
          transfer references, payout
          requests, and related financial
          records.
        </p>

        <h3
          style={{
            margin: '22px 0 10px',
            fontSize: '1.05rem',
            color: '#171717',
          }}
        >
          Technical and usage information
        </h3>

        <p style={{ margin: 0 }}>
          BeatMarket and its infrastructure
          providers may automatically process
          technical information such as:
        </p>

        <ul
          style={{
            margin: '12px 0 0',
            paddingLeft: '24px',
          }}
        >
          <li>
            IP address and approximate
            location derived from it;
          </li>
          <li>
            browser, device, operating system,
            and language information;
          </li>
          <li>
            request timestamps, routes,
            errors, and security logs;
          </li>
          <li>
            authentication, session, and
            service-performance information.
          </li>
        </ul>

        <h3
          style={{
            margin: '22px 0 10px',
            fontSize: '1.05rem',
            color: '#171717',
          }}
        >
          Communications
        </h3>

        <p style={{ margin: 0 }}>
          BeatMarket may process information
          you provide in support requests,
          ownership complaints, refund
          requests, legal notices, or other
          communications.
        </p>
      </LegalSection>

      <LegalSection title="2. How information is used">
        <p style={{ margin: 0 }}>
          BeatMarket may use information to:
        </p>

        <ul
          style={{
            margin: '12px 0 0',
            paddingLeft: '24px',
          }}
        >
          <li>
            create, authenticate, secure, and
            manage accounts;
          </li>

          <li>
            operate the beat marketplace and
            display producer profiles;
          </li>

          <li>
            process purchases, orders,
            licenses, refunds, producer
            earnings, and payouts;
          </li>

          <li>
            store, stream, deliver, and
            protect uploaded and purchased
            files;
          </li>

          <li>
            send account, purchase, sale,
            refund, payout, and security
            notifications;
          </li>

          <li>
            detect fraud, abuse, duplicate
            processing, unauthorized access,
            and violations of marketplace
            rules;
          </li>

          <li>
            investigate disputes, ownership
            claims, chargebacks, technical
            failures, and legal requests;
          </li>

          <li>
            maintain, troubleshoot, test, and
            improve the service;
          </li>

          <li>
            comply with applicable legal,
            accounting, tax, and regulatory
            obligations;
          </li>

          <li>
            establish, exercise, or defend
            legal claims.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Legal grounds for processing">
        <p style={{ margin: 0 }}>
          Depending on the circumstances and
          applicable law, BeatMarket may
          process personal information because
          it is necessary to:
        </p>

        <ul
          style={{
            margin: '12px 0 0',
            paddingLeft: '24px',
          }}
        >
          <li>
            perform a contract or take steps
            requested before entering one;
          </li>

          <li>
            comply with a legal obligation;
          </li>

          <li>
            protect legitimate interests such
            as operating, securing, improving,
            and defending the marketplace;
          </li>

          <li>
            protect users, BeatMarket, or
            another person from fraud, abuse,
            or harm;
          </li>

          <li>
            act with consent when consent is
            required.
          </li>
        </ul>

        <p style={{ margin: '14px 0 0' }}>
          Where processing depends on consent,
          consent may be withdrawn as allowed
          by law. Withdrawal does not affect
          processing that was lawful before
          withdrawal.
        </p>
      </LegalSection>

      <LegalSection title="4. Cookies, sessions, and local storage">
        <p style={{ margin: 0 }}>
          BeatMarket may use browser storage,
          authentication cookies, session
          technologies, and similar tools to
          keep users signed in, protect
          accounts, remember marketplace
          state, and provide essential
          features.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          For example, shopping-cart
          information may be stored in the
          browser so it remains available
          between page visits.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          Disabling essential browser storage
          or cookies may prevent parts of
          BeatMarket from functioning
          correctly.
        </p>
      </LegalSection>

      <LegalSection title="5. When information is shared">
        <p style={{ margin: 0 }}>
          BeatMarket does not sell personal
          information as part of its ordinary
          marketplace operations.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          Information may be shared with the
          following categories of recipients
          when reasonably necessary:
        </p>

        <h3
          style={{
            margin: '22px 0 10px',
            fontSize: '1.05rem',
            color: '#171717',
          }}
        >
          Service providers
        </h3>

        <p style={{ margin: 0 }}>
          BeatMarket uses third-party
          providers for services including
          hosting, databases, authentication,
          payment processing, file storage,
          email delivery, security, and
          infrastructure.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          Current providers may include
          Supabase, Iyzico, Cloudflare,
          Resend, and Vercel. Each provider
          processes information under its own
          terms, privacy documentation, and
          security practices.
        </p>

        <h3
          style={{
            margin: '22px 0 10px',
            fontSize: '1.05rem',
            color: '#171717',
          }}
        >
          Marketplace participants
        </h3>

        <p style={{ margin: 0 }}>
          Limited information may be shared
          between buyers and producers where
          necessary to display public
          producer identity, complete a
          transaction, provide a license,
          resolve a dispute, or satisfy a
          legal requirement.
        </p>

        <h3
          style={{
            margin: '22px 0 10px',
            fontSize: '1.05rem',
            color: '#171717',
          }}
        >
          Legal and safety disclosures
        </h3>

        <p style={{ margin: 0 }}>
          Information may be preserved or
          disclosed when BeatMarket reasonably
          believes this is necessary to:
        </p>

        <ul
          style={{
            margin: '12px 0 0',
            paddingLeft: '24px',
          }}
        >
          <li>
            comply with law, court orders, or
            valid governmental requests;
          </li>

          <li>
            investigate fraud, security
            incidents, infringement, or
            unlawful conduct;
          </li>

          <li>
            enforce marketplace terms and
            policies;
          </li>

          <li>
            protect the rights, safety,
            property, and integrity of users,
            BeatMarket, or others.
          </li>
        </ul>

        <h3
          style={{
            margin: '22px 0 10px',
            fontSize: '1.05rem',
            color: '#171717',
          }}
        >
          Business changes
        </h3>

        <p style={{ margin: 0 }}>
          Information may be transferred as
          part of a merger, acquisition,
          financing, restructuring, sale of
          assets, or similar business
          transaction, subject to applicable
          legal requirements.
        </p>
      </LegalSection>

      <LegalSection title="6. Public information">
        <p style={{ margin: 0 }}>
          Producer display names, usernames,
          published beats, beat descriptions,
          prices, artwork, audio previews, and
          other marketplace information may
          be visible publicly.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          Information made public may be
          viewed, copied, indexed, or shared
          by other people or services outside
          BeatMarket&apos;s control. Users
          should avoid placing sensitive
          personal information in public
          profile or beat-description fields.
        </p>
      </LegalSection>

      <LegalSection title="7. International processing">
        <p style={{ margin: 0 }}>
          BeatMarket and its service providers
          may process or store information in
          countries other than the country
          where a user lives.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          Where required, appropriate legal
          mechanisms and safeguards should be
          used for international transfers of
          personal information.
        </p>
      </LegalSection>

      <LegalSection title="8. Data retention">
        <p style={{ margin: 0 }}>
          BeatMarket retains information for
          as long as reasonably necessary to
          provide the service and fulfill the
          purposes described in this Policy.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          Retention periods may depend on:
        </p>

        <ul
          style={{
            margin: '12px 0 0',
            paddingLeft: '24px',
          }}
        >
          <li>
            whether an account remains active;
          </li>

          <li>
            transaction, refund, payout, and
            accounting requirements;
          </li>

          <li>
            fraud-prevention and security
            needs;
          </li>

          <li>
            ownership disputes, chargebacks,
            and legal claims;
          </li>

          <li>
            applicable legal, tax, regulatory,
            and recordkeeping obligations.
          </li>
        </ul>

        <p style={{ margin: '14px 0 0' }}>
          Some records may remain after an
          account is closed when retention is
          required or permitted for these
          purposes.
        </p>
      </LegalSection>

      <LegalSection title="9. Data security">
        <p style={{ margin: 0 }}>
          BeatMarket uses administrative and
          technical measures intended to
          protect information against
          unauthorized access, alteration,
          disclosure, loss, or misuse.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          These measures may include
          authenticated access, restricted
          storage, database access controls,
          transaction verification, logging,
          and security monitoring.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          No internet service, storage system,
          or transmission method can be
          guaranteed to be completely secure.
          Users are responsible for protecting
          their passwords, devices, and
          account sessions.
        </p>
      </LegalSection>

      <LegalSection title="10. Your privacy choices and rights">
        <p style={{ margin: 0 }}>
          Subject to applicable law, you may
          have rights to:
        </p>

        <ul
          style={{
            margin: '12px 0 0',
            paddingLeft: '24px',
          }}
        >
          <li>
            request information about how
            personal data is processed;
          </li>

          <li>
            access personal information held
            about you;
          </li>

          <li>
            request correction of inaccurate
            or incomplete information;
          </li>

          <li>
            request deletion or restriction
            of certain processing;
          </li>

          <li>
            object to certain processing;
          </li>

          <li>
            request a portable copy of
            eligible information;
          </li>

          <li>
            withdraw consent where processing
            is based on consent;
          </li>

          <li>
            submit a complaint to an
            appropriate data-protection
            authority.
          </li>
        </ul>

        <p style={{ margin: '14px 0 0' }}>
          These rights may be limited by
          identity-verification requirements,
          contractual obligations, the rights
          of others, fraud-prevention needs,
          and legal recordkeeping duties.
        </p>
      </LegalSection>

      <LegalSection title="11. Account deletion requests">
        <p style={{ margin: 0 }}>
          Users may request account deletion
          through BeatMarket&apos;s official
          support or privacy-contact channel.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          Before processing a request,
          BeatMarket may require verification
          of identity and may retain
          transaction, payout, refund,
          security, or legal records where
          required or permitted.
        </p>
      </LegalSection>

      <LegalSection title="12. Children">
        <p style={{ margin: 0 }}>
          BeatMarket is not intended for
          children who are legally unable to
          enter into marketplace and licensing
          agreements.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          A parent or legal guardian who
          believes a child has provided
          personal information without proper
          authorization should contact
          BeatMarket so the matter can be
          reviewed.
        </p>
      </LegalSection>

      <LegalSection title="13. Third-party links and services">
        <p style={{ margin: 0 }}>
          BeatMarket may contain links to
          third-party websites or rely on
          third-party services. This Policy
          does not control the independent
          privacy practices of those third
          parties.
        </p>
      </LegalSection>

      <LegalSection title="14. Changes to this Policy">
        <p style={{ margin: 0 }}>
          This Privacy Policy may be updated
          as BeatMarket&apos;s features,
          providers, business practices, or
          legal obligations change.
        </p>

        <p style={{ margin: '14px 0 0' }}>
          The current update date will appear
          at the top of this page. Material
          changes may also be communicated
          through the service or by email
          where appropriate.
        </p>
      </LegalSection>

      <LegalSection title="15. Contact">
        <p style={{ margin: 0 }}>
          Privacy requests, account-deletion
          requests, questions, or complaints
          should be submitted through
          BeatMarket&apos;s official support
          or privacy-contact channel.
        </p>
      </LegalSection>
    </LegalPage>
  );
}