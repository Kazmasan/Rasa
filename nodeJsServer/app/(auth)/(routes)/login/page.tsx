import type { Metadata } from "next";
import { Button } from "@/components/button";
import { Input } from "@/components/inputs/input";
import { ToggleInput } from "@/components/inputs/toggle-input";
import { CustomLink as Link } from "@/components/link";
import { Form } from "@/components/form";
import { Img } from "@/components/img";

export const metadata: Metadata = {
    title: "Login - RESQ",
    description: "RESQ login page",
};

const LogInPage = () => {
    return (
        <Form
            action="/auth"
            method="post"
            className="w-[445px] bg-background rounded-[15px] flex flex-col gap-[22px] p-[40px] items-center justify-center"
        >
            <div className="flex gap-[10px] items-center">
                <Img src="/img/resq-logo.png" alt="resq + logo" width={220} height={63}></Img>
            </div>
            <h2 className="text-2xl font-bold text-primary text-center">
                Log in to the <br />dashboard
            </h2>
            <Input
                type="text"
                name="username"
                className="w-full"
                placeholder="Username"
                required
            />
            <Input
                type="password"
                name="password"
                className="w-full"
                placeholder="Password"
                required
            />
            <ToggleInput name="rememberMe" label="Remember me" />
            <Button type="submit" className="w-full mt-[22px]">
                Login
            </Button>
            <p className="uppercase font-bold text-gray-dark text-sm">
                Or
            </p>
            <Link href="/auth/as-guest" className="font-semibold" prefetch={false}>Continue as guest</Link>
            <Link href="/auth/keycloak" className="font-semibold" prefetch={false}>Authenticate with Keycloak</Link>
        </Form>
    );
};

export default LogInPage;
