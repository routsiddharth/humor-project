import { redirect } from "next/navigation";

import { completeOnboarding } from "@/app/profile/actions";
import { ProfileForm } from "@/components/profile-form";
import { getProfile, isProfileComplete, requireUser, safeNext } from "@/lib/auth";

export const metadata = { title: "Welcome · humor-project" };

// The gate the assignment asks for: a signed-in user whose profile row exists
// but has no name gets sent here before anything else.
export default async function OnboardingPage({
  searchParams,
}: PageProps<"/onboarding">) {
  const params = await searchParams;
  const next = safeNext(params.next);

  const user = await requireUser("/onboarding");
  const profile = await getProfile(user.id);

  // Nothing to prompt for — either they finished, or they navigated here by hand.
  if (isProfileComplete(profile)) redirect(next);

  return (
    <main className="page page--narrow">
      <header className="page__head">
        <h1 className="page__title">One last thing</h1>
        <p className="page__sub">
          You are signed in as {user.email}. Tell us what to call you and you are
          done.
        </p>
      </header>

      <div className="panel">
        <ProfileForm
          submitAction={completeOnboarding}
          firstName=""
          lastName=""
          initials="?"
          currentAvatarUrl={null}
          submitLabel="Continue"
          showAvatar={false}
          next={next}
        />
        <p className="panel__foot">
          You can add a photo from your profile page afterwards.
        </p>
      </div>
    </main>
  );
}
