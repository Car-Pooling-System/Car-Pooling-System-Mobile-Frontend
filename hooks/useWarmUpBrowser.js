import * as WebBrowser from "expo-web-browser";
import { useEffect } from "react";

export const useWarmUpBrowser = () => {
    useEffect(() => {
        WebBrowser.warmUpAsync();
        WebBrowser.maybeCompleteAuthSession();

        return () => {
            WebBrowser.coolDownAsync();
        };
    }, []);
};
